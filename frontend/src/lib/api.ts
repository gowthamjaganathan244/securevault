import type { AuditEvent, UserRole, VaultFile } from "./types";

const API_BASE = "https://0oatkqbq9l.execute-api.ap-southeast-2.amazonaws.com";

export const endpoints = {
  files: `${API_BASE}/files`,
  auditLogs: `${API_BASE}/audit-logs`,
  uploadUrl: `${API_BASE}/generate-upload-url`,
  downloadUrl: `${API_BASE}/download-url`,
};

export class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

export async function getFiles(signal?: AbortSignal): Promise<VaultFile[]> {
  const res = await fetch(endpoints.files, { method: "GET", cache: "no-store", signal });
  if (!res.ok) throw new ApiError("Couldn't load documents.", res.status);
  const data = await res.json();
  return (data.files as VaultFile[]) || [];
}

export async function getAuditLogs(signal?: AbortSignal): Promise<AuditEvent[]> {
  const res = await fetch(endpoints.auditLogs, { method: "GET", cache: "no-store", signal });
  if (!res.ok) throw new ApiError("Couldn't load activity.", res.status);
  const data = await res.json();
  const entries = (data.auditLogs as AuditEvent[]) || [];
  return entries.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
}

export interface UploadTicket {
  uploadUrl: string;
  fileId: string;
  s3Key: string;
}

export async function requestUploadUrl(input: {
  file: File;
  classification: string;
  uploadedBy: string;
  auditNote: string;
}): Promise<UploadTicket> {
  const res = await fetch(endpoints.uploadUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: input.file.name,
      contentType: input.file.type || "application/octet-stream",
      classification: input.classification,
      uploadedBy: input.uploadedBy,
      auditNote: input.auditNote,
    }),
  });
  if (!res.ok) throw new ApiError("The vault couldn't issue a secure upload link.", res.status);
  const data = await res.json();
  if (!data.uploadUrl || !data.fileId) throw new ApiError("The upload link response was incomplete.");
  return { uploadUrl: data.uploadUrl, fileId: data.fileId, s3Key: data.s3Key };
}

/**
 * PUTs the file to the presigned S3 URL with real byte progress.
 * Resolves only when S3 answers 2xx.
 */
export function putToS3(
  url: string,
  file: File,
  onProgress: (loaded: number, total: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded, e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(file.size, file.size);
        resolve();
      } else if (xhr.status === 403) {
        reject(new ApiError("S3 refused the transfer — the upload link may have expired.", 403));
      } else {
        reject(new ApiError(`S3 rejected the transfer (HTTP ${xhr.status}).`, xhr.status));
      }
    };
    xhr.onerror = () => reject(new ApiError("The connection to S3 was interrupted."));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

export type DownloadOutcome =
  | { ok: true; url: string }
  | { ok: false; reason: string; status?: number };

/** Asks the API for a short-lived presigned download link. The URL is never stored or displayed. */
export async function requestDownload(fileId: string, userEmail: string, userRole: UserRole): Promise<DownloadOutcome> {
  try {
    const params = new URLSearchParams({ fileId, userEmail, userRole });
    const res = await fetch(`${endpoints.downloadUrl}?${params.toString()}`, { method: "GET" });
    if (res.status === 403) return { ok: false, status: 403, reason: "Your role isn't allowed to download this document." };
    if (res.status === 404) return { ok: false, status: 404, reason: "This document couldn't be found in storage." };
    if (!res.ok) return { ok: false, status: res.status, reason: "The vault couldn't create a download link." };
    const data = await res.json();
    if (!data.downloadUrl) return { ok: false, reason: "The vault couldn't create a download link." };
    return { ok: true, url: data.downloadUrl as string };
  } catch {
    return { ok: false, reason: "Network error while requesting a download link." };
  }
}

/* ── Pending integrations ─────────────────────────────────────────────
 * The UI for these actions is complete, but the vault API does not expose
 * the endpoints yet (verified: each path returns 404). Flip a flag to true
 * only once its endpoint is deployed — until then the UI explains that the
 * action isn't connected and never calls the network or reports success.
 */
export const integrations = {
  deleteFile: false,
  replaceFile: false,
  updateMetadata: false,
  versionHistory: false,
  userDirectory: false,
} as const;

export const pendingEndpoints = {
  deleteFile: "DELETE /files/{fileId}",
  replaceFile: "POST /files/{fileId}/replace-url",
  updateMetadata: "PATCH /files/{fileId}",
  versionHistory: "GET /files/{fileId}/versions",
  userDirectory: "GET /users",
} as const;

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 403) throw new ApiError("Your role isn't allowed to do this.", 403);
  if (res.status === 404) throw new ApiError("This document no longer exists.", 404);
  if (!res.ok) throw new ApiError(`The vault couldn't complete this (HTTP ${res.status}).`, res.status);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** DELETE /files/{fileId} — server checks role/ownership, removes the S3 object and record, writes FILE_DELETED. */
export function deleteFile(fileId: string, userEmail: string, userRole: UserRole) {
  return call<void>("DELETE", `/files/${encodeURIComponent(fileId)}?${new URLSearchParams({ userEmail, userRole })}`);
}

/**
 * POST /files/{fileId}/replace-url — returns a presigned PUT for a *new* object key.
 * The S3 trigger verifies the new object before re-pointing the record, so the
 * existing content is never overwritten before the replacement is confirmed.
 */
export function requestReplaceUrl(fileId: string, input: { file: File; userEmail: string; userRole: UserRole }) {
  return call<UploadTicket>("POST", `/files/${encodeURIComponent(fileId)}/replace-url`, {
    fileName: input.file.name,
    contentType: input.file.type || "application/octet-stream",
    userEmail: input.userEmail,
    userRole: input.userRole,
  });
}

/** PATCH /files/{fileId} — updates classification / audit note, writes METADATA_UPDATED. */
export function updateMetadata(fileId: string, patch: { classification: string; auditNote: string; userEmail: string; userRole: UserRole }) {
  return call<VaultFile>("PATCH", `/files/${encodeURIComponent(fileId)}`, patch);
}

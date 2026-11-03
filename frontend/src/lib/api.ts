import { fetchAuthSession } from "aws-amplify/auth";
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

/** Fired when the API rejects the session (401) so the app can send the user back to sign in. */
export const UNAUTHORIZED_EVENT = "sv:unauthorized";

/**
 * Every vault API request goes through here: it attaches the current Cognito
 * access token (refreshed by Amplify when needed) as a Bearer token. The server
 * derives identity and role from that token. Never used for presigned S3 URLs.
 */
async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  let token: string | undefined;
  try {
    token = (await fetchAuthSession()).tokens?.accessToken?.toString();
  } catch {
    token = undefined;
  }
  if (!token) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new ApiError("Your session has ended. Please sign in again.", 401);
  }
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new ApiError("Your session has ended. Please sign in again.", 401);
  }
  return res;
}

export async function getFiles(signal?: AbortSignal): Promise<VaultFile[]> {
  const res = await apiFetch(endpoints.files, { method: "GET", cache: "no-store", signal });
  if (!res.ok) throw await failure(res, "Couldn't load documents");
  const data = await res.json();
  return (data.files as VaultFile[]) || [];
}

export async function getAuditLogs(signal?: AbortSignal): Promise<AuditEvent[]> {
  const res = await apiFetch(endpoints.auditLogs, { method: "GET", cache: "no-store", signal });
  if (!res.ok) throw await failure(res, "Couldn't load activity");
  const data = await res.json();
  // Legacy events carry `userEmail`/`userRole`; lifecycle events carry `email`/`user`/`role`.
  const entries = ((data.auditLogs as (AuditEvent & { email?: string; user?: string; role?: string })[]) || []).map((e) => ({
    ...e,
    userEmail: e.userEmail ?? e.email ?? e.user ?? "unknown",
    userRole: e.userRole ?? e.role ?? "",
  }));
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
  const res = await apiFetch(endpoints.uploadUrl, {
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
  if (!res.ok) throw await failure(res, "The vault couldn't issue a secure upload link");
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
    const res = await apiFetch(`${endpoints.downloadUrl}?${params.toString()}`, { method: "GET" });
    if (res.status === 403) return { ok: false, status: 403, reason: "Your role isn't allowed to download this document." };
    if (res.status === 404) return { ok: false, status: 404, reason: "This document couldn't be found in storage." };
    if (!res.ok) return { ok: false, status: res.status, reason: "The vault couldn't create a download link." };
    const data = await res.json();
    if (!data.downloadUrl) return { ok: false, reason: "The vault couldn't create a download link." };
    return { ok: true, url: data.downloadUrl as string };
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return { ok: false, status: 401, reason: err.message };
    return { ok: false, reason: "Network error while requesting a download link." };
  }
}

/* ── Document lifecycle, versions, directory and privacy ─────────────────
 * Implemented exactly to SecureVault_Actual_Backend_Contract.md (handler.py).
 * Identity and role come from the Bearer token server-side; the browser never
 * sends a role for these routes.
 */
export const integrations = {
  deleteFile: true,
  replaceFile: true,
  updateMetadata: true,
  versionHistory: true,
  userDirectory: true,
  privacyScan: true,
  privacyVoice: true,
  /** One-time Macie batch discovery job (GET /macie/status, GET /files/{id}/macie). */
  macie: true,
} as const;

export const pendingEndpoints = {
  deleteFile: "DELETE /files/{fileId}",
  replaceFile: "POST /files/{fileId}/replace-url",
  updateMetadata: "PATCH /files/{fileId}",
  versionHistory: "GET /files/{fileId}/versions",
  userDirectory: "GET /users",
} as const;

/** Reads the backend's `{ message }` so 400/403/404/409/422/502 explain themselves. */
async function failure(res: Response, fallback: string): Promise<ApiError> {
  let message = "";
  try {
    const body = await res.clone().json();
    message = typeof body?.message === "string" ? body.message : "";
  } catch {
    /* non-JSON body */
  }
  const prefix =
    res.status === 403 ? "Not allowed: " : res.status === 409 ? "Can't do that right now: " : res.status === 422 ? "Unsupported: " : "";
  return new ApiError(message ? `${prefix}${message}` : `${fallback} (HTTP ${res.status}).`, res.status);
}

async function call<T>(method: string, path: string, body?: unknown, fallback = "The vault couldn't complete this"): Promise<T> {
  const res = await apiFetch(`${API_BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw await failure(res, fallback);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const fid = (id: string) => encodeURIComponent(id);

/** 200 `{ fileId, status: "DELETED", message }` — removed from the active vault; versioned S3 may keep history. */
export function deleteFile(fileId: string) {
  return call<{ fileId: string; status: string; message?: string }>("DELETE", `/files/${fid(fileId)}`, undefined, "Couldn't delete this document");
}

/** 200 `{ fileId, classification, auditNote }` — Admin or owner; non-Admin downgrades are refused. */
export function updateMetadata(fileId: string, patch: { classification?: string; auditNote?: string }) {
  return call<{ fileId: string; classification: string; auditNote: string }>("PATCH", `/files/${fid(fileId)}`, patch, "Couldn't save these details");
}

export interface ReplaceTicket {
  fileId: string;
  uploadUrl: string;
  s3Key: string;
  expiresIn: number;
  message?: string;
}

/** 200 presigned PUT for a new key; 409 if a replacement is already outstanding. Confirmation arrives asynchronously. */
export function requestReplaceUrl(fileId: string, file: File) {
  return call<ReplaceTicket>(
    "POST",
    `/files/${fid(fileId)}/replace-url`,
    { fileName: file.name, contentType: file.type || "application/octet-stream" },
    "Couldn't start the replacement",
  );
}

export interface FileVersion {
  versionId: string;
  fileName: string;
  isCurrent: boolean;
  createdAt?: string;
  /** The live API returns null when the size isn't recorded. */
  size?: number | null;
}

export async function getVersions(fileId: string) {
  const r = await call<{ fileId: string; versions: FileVersion[] }>("GET", `/files/${fid(fileId)}/versions`, undefined, "Couldn't load versions");
  // The live API returns size as a number, a numeric string, or null.
  const versions = (r.versions ?? []).map((v) => {
    const n = v.size == null ? NaN : Number(v.size);
    return { ...v, size: Number.isFinite(n) ? n : null };
  });
  return { ...r, versions };
}

/** Presigned link for one version — opened without any Cognito header. */
export async function getVersionDownloadUrl(fileId: string, versionId: string) {
  const r = await call<{ downloadUrl?: string; url?: string; expiresIn?: number }>(
    "GET",
    `/files/${fid(fileId)}/versions/${encodeURIComponent(versionId)}/download-url`,
    undefined,
    "Couldn't create a link for this version",
  );
  const url = r.downloadUrl ?? r.url;
  if (!url) throw new ApiError("The vault didn't return a download link.");
  return url;
}

export interface DirectoryUser {
  username: string;
  sub?: string;
  email?: string;
  emailVerified?: boolean;
  enabled: boolean;
  status: string;
  groups: string[];
  mfaSettings: string[];
  createdAt?: string;
}

/** Admin-only; 403 for everyone else. */
export function getUsers() {
  return call<{ users: DirectoryUser[]; count: number }>("GET", "/users", undefined, "Couldn't load the user directory");
}

export interface PrivacyReview {
  status: "COMPLETE" | "REVIEW_REQUIRED" | string;
  recommendedClassification?: string;
  piiTypes?: string[];
  reviewedTextCharacters?: number;
  partialTextReview?: boolean;
  scannedAt?: string;
  engine?: string;
}

export function getSecurity(fileId: string) {
  return call<{ fileId: string; privacyReview: PrivacyReview | null; versionCount?: number }>(
    "GET",
    `/files/${fid(fileId)}/security`,
    undefined,
    "Couldn't load the privacy review",
  );
}

/** Textract + Comprehend scan; 422 for unsupported files or blank extraction. */
export function runPrivacyScan(fileId: string) {
  return call<{ fileId: string; privacyReview: PrivacyReview }>("POST", `/files/${fid(fileId)}/privacy-scan`, undefined, "The privacy scan failed");
}

/** Amazon Polly guidance as audio/mpeg bytes; 409 until a successful scan exists. */
export async function getPrivacyVoice(fileId: string): Promise<Blob> {
  const res = await apiFetch(`${API_BASE}/files/${fid(fileId)}/privacy-voice`, { method: "POST" });
  if (!res.ok) throw await failure(res, "Couldn't generate spoken guidance");
  const blob = await res.blob();
  if (!blob.type.startsWith("audio/")) throw new ApiError("The vault didn't return audio.");
  return blob;
}

/* ── Amazon Macie (asynchronous, one-time batch discovery) ───────────────
 * Shapes from macie_status_lambda.py. Macie never returns sensitive values
 * here, and its results never change a document's classification.
 */
export interface MacieStatus {
  provider: string;
  configured: boolean;
  mode: string;
  scope: string[];
  jobId: string;
  /** Macie job status, e.g. RUNNING, COMPLETE, CANCELLED, PAUSED, USER_PAUSED, IDLE. */
  jobStatus: string;
  jobType: string;
  createdAt: string | null;
  /** "NONE" or an error code from the last run. */
  lastRunError: string;
  findingCount: number;
  findingsTruncated: boolean;
  notice: string;
}

export interface FileMacie {
  fileId: string;
  coveredByJobScope: boolean;
  jobStatus: string;
  jobId?: string;
  jobType?: string;
  createdAt?: string | null;
  lastRunError?: string;
  findingCount: number | null;
  findingSeverities?: string[];
  findingTypes?: string[];
  resultsTruncated?: boolean;
  notice: string;
}

/** Admin only (403 otherwise). */
export function getMacieStatus() {
  return call<MacieStatus>("GET", "/macie/status", undefined, "Couldn't load Macie status");
}

/** Admin or the document's owner. 404 for unknown or deleted documents. */
export function getFileMacie(fileId: string) {
  return call<FileMacie>("GET", `/files/${fid(fileId)}/macie`, undefined, "Couldn't load Macie results");
}

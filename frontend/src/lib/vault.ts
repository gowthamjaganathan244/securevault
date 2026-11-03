import type { AuditEvent, ClassificationLevel, UploadState, UserRole, VaultFile } from "./types";

/** A PENDING_UPLOAD record older than this never received its S3 confirmation. */
const CONFIRMATION_WINDOW_MS = 15 * 60_000;

export function uploadState(file: VaultFile, now = Date.now()): UploadState {
  if (file.status === "ACTIVE") return "stored";
  if (file.status === "PENDING_UPLOAD") {
    const created = Date.parse(file.createdAt ?? "");
    if (!Number.isNaN(created) && now - created > CONFIRMATION_WINDOW_MS) return "not-received";
    return "awaiting";
  }
  return "unknown";
}

export const uploadStateCopy: Record<UploadState, { label: string; detail: string }> = {
  stored: { label: "Stored", detail: "S3 confirmed the object is in the private bucket." },
  awaiting: { label: "Awaiting S3", detail: "An upload link was issued; S3 hasn't confirmed the file yet." },
  "not-received": {
    label: "Not received",
    detail: "An upload link was issued, but S3 never confirmed a file. The transfer likely didn't finish.",
  },
  unknown: { label: "Unknown", detail: "The record has a status this app doesn't recognise." },
};

export const classifications: ClassificationLevel[] = ["Public", "Internal", "Confidential", "Restricted"];

export const classificationCopy: Record<
  ClassificationLevel,
  { summary: string; detail: string; examples: string }
> = {
  Public: {
    summary: "Safe for anyone to see.",
    detail: "Nothing sensitive. Sharing it outside the organisation would cause no harm.",
    examples: "Brochures, published reports, press material",
  },
  Internal: {
    summary: "For people inside the organisation.",
    detail: "Everyday working documents that shouldn't leave the company, but aren't sensitive.",
    examples: "Policies, team notes, internal letters",
  },
  Confidential: {
    summary: "Only for people who need it.",
    detail: "Sensitive personal or business information. Exposure could cause real harm.",
    examples: "Payslips, contracts, HR records",
  },
  Restricted: {
    summary: "The most sensitive tier.",
    detail: "Highly sensitive material. Access should be limited to a small, named group.",
    examples: "Legal matters, credentials, board papers",
  },
};

export function fileExtension(name: string) {
  const m = /\.([a-z0-9]{1,6})$/i.exec(name);
  return m ? m[1].toLowerCase() : "";
}

export type FileKind = "pdf" | "doc" | "sheet" | "slide" | "image" | "archive" | "text" | "other";

export function fileKind(name: string, contentType?: string): FileKind {
  const ext = fileExtension(name);
  if (ext === "pdf" || contentType === "application/pdf") return "pdf";
  if (["doc", "docx", "rtf", "odt", "pages"].includes(ext)) return "doc";
  if (["xls", "xlsx", "csv", "numbers", "ods"].includes(ext)) return "sheet";
  if (["ppt", "pptx", "key", "odp"].includes(ext)) return "slide";
  if (["png", "jpg", "jpeg", "gif", "webp", "heic", "svg"].includes(ext) || contentType?.startsWith("image/")) return "image";
  if (["zip", "7z", "rar", "tar", "gz"].includes(ext)) return "archive";
  if (["txt", "md", "json", "log"].includes(ext) || contentType?.startsWith("text/")) return "text";
  return "other";
}

export const kindLabel: Record<FileKind, string> = {
  pdf: "PDF document",
  doc: "Word document",
  sheet: "Spreadsheet",
  slide: "Presentation",
  image: "Image",
  archive: "Archive",
  text: "Text file",
  other: "Document",
};

/** Uploads chosen in the studio, in the order the original dropzone accepted them. */
export const ACCEPTED_EXTENSIONS = ["pdf", "doc", "docx", "xls", "xlsx", "zip"];
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

export function validateUpload(file: File): string | null {
  const ext = fileExtension(file.name);
  if (!ACCEPTED_EXTENSIONS.includes(ext)) {
    return `.${ext || "unknown"} files aren't accepted. Use PDF, Word, Excel or ZIP.`;
  }
  if (file.size === 0) return "This file is empty.";
  if (file.size > MAX_UPLOAD_BYTES) return "This file is larger than the 500 MB vault limit.";
  return null;
}

export function sortByRecent(files: VaultFile[]) {
  return [...files].sort(
    (a, b) => Date.parse(b.uploadedAt || b.createdAt || "") - Date.parse(a.uploadedAt || a.createdAt || ""),
  );
}

export function isDenied(event: AuditEvent) {
  return event.result === "FAILED" || /DENIED/.test(event.action);
}

export function isIncomplete(event: AuditEvent) {
  return event.result === "INCOMPLETE";
}

export function deniedWithin(events: AuditEvent[], days: number, now = Date.now()) {
  const since = now - days * 86_400_000;
  return events.filter((e) => isDenied(e) && Date.parse(e.timestamp) > since);
}

export function hasRealFile(event: AuditEvent) {
  return !!event.fileId && event.fileId !== "unknown";
}

export function hasRealActor(event: AuditEvent) {
  return !!event.userEmail && event.userEmail !== "unknown";
}

/** Events written by the vault itself (e.g. S3 → EventBridge confirming a replacement). */
export function isSystemActor(event: AuditEvent) {
  return event.userEmail?.toLowerCase() === "system";
}

/**
 * Upload events that the vault genuinely recorded in document metadata
 * (DynamoDB): S3 confirmation time for stored files, link issue time for
 * uploads S3 never confirmed. The audit-log API doesn't record uploads.
 */
export function recordEvents(files: VaultFile[], now = Date.now()): AuditEvent[] {
  const out: AuditEvent[] = [];
  for (const f of files) {
    const state = uploadState(f, now);
    if (state === "stored" && f.uploadedAt) {
      out.push({
        auditId: `record:${f.fileId}:stored`,
        action: "FILE_UPLOADED",
        userEmail: f.uploadedBy ?? "unknown",
        userRole: "",
        result: "SUCCESS",
        fileId: f.fileId,
        fileName: f.fileName,
        reason: `${f.classification} · confirmed by S3`,
        timestamp: f.uploadedAt,
        source: "records",
      });
    } else if (state === "not-received" && f.createdAt) {
      out.push({
        auditId: `record:${f.fileId}:incomplete`,
        action: "UPLOAD_NOT_CONFIRMED",
        userEmail: f.uploadedBy ?? "unknown",
        userRole: "",
        result: "INCOMPLETE",
        fileId: f.fileId,
        fileName: f.fileName,
        reason: "Upload link issued; S3 never confirmed a file",
        timestamp: f.createdAt,
        source: "records",
      });
    }
  }
  return out;
}

/** Natural-language verb for an audit action. Unknown actions fall back to their readable code. */
export function describeAction(event: AuditEvent) {
  switch (event.action) {
    case "FILE_DOWNLOADED":
      return "downloaded";
    case "DOWNLOAD_DENIED":
      return "was denied a download of";
    case "FILE_UPLOADED":
      return "uploaded";
    case "UPLOAD_NOT_CONFIRMED":
      return "started an unfinished upload of";
    case "FILE_DELETED":
      return "deleted";
    case "FILE_REPLACED":
      return "confirmed the replacement of";
    case "PRIVACY_SCANNED":
      return "ran a privacy scan on";
    case "METADATA_UPDATED":
      return "updated the details of";
    default:
      return event.action.toLowerCase().replace(/_/g, " ");
  }
}

/** Activity visible to a role. Users see only their own recorded events. */
export function scopeEvents(events: AuditEvent[], role: UserRole, email: string) {
  if (role === "Admin" || role === "Auditor") return events;
  return events.filter((e) => e.userEmail === email);
}

/** Admins can manage any document; Users only their own. Auditors are read-only. */
export function canManage(file: VaultFile, role: UserRole, email: string) {
  if (role === "Admin") return true;
  return role === "User" && !!email && file.uploadedBy === email;
}

/** Real signals only: uploads S3 hasn't confirmed, or documents with denied access attempts. */
export function needsAttention(file: VaultFile, deniedFileIds: Set<string>) {
  const s = uploadState(file);
  return s === "awaiting" || s === "not-received" || deniedFileIds.has(file.fileId);
}

export function canDownload(role: UserRole) {
  return role !== "Auditor";
}

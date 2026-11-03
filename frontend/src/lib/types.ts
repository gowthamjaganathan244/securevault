export type UserRole = "Admin" | "User" | "Auditor";
export type ClassificationLevel = "Public" | "Internal" | "Confidential" | "Restricted";

/** A document record as returned by GET /files (DynamoDB metadata). */
export interface VaultFile {
  fileId: string;
  fileName: string;
  classification: ClassificationLevel;
  /** PENDING_UPLOAD until the S3 ObjectCreated trigger marks it ACTIVE. */
  status: string;
  uploadedBy?: string;
  auditNote?: string;
  /** When the presigned upload URL was issued. */
  createdAt?: string;
  /** When S3 confirmed the object (set by the S3 trigger). */
  uploadedAt?: string;
  contentType?: string;
  objectSize?: number;
  s3Key?: string;
  safeFileName?: string;
}

/** An audit entry as returned by GET /audit-logs. */
export interface AuditEvent {
  auditId: string;
  action: string;
  userEmail: string;
  userRole: string;
  result: string;
  fileId?: string;
  fileName?: string;
  reason?: string;
  timestamp: string;
  /** "audit" = the audit-log API; "records" = derived from document metadata timestamps. */
  source?: "audit" | "records";
}

/** Upload state derived from metadata — never from presigned URL creation alone. */
export type UploadState = "stored" | "awaiting" | "not-received" | "unknown";

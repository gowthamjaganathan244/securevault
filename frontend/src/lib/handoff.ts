import type { ClassificationLevel } from "./types";

// Carries a file dropped on the Workspace into Upload Studio across a client-side navigation.
let pending: File | null = null;

export function handOffFile(file: File) {
  pending = file;
}

export function takeHandedOffFile() {
  const file = pending;
  pending = null;
  return file;
}

/** Details of an incomplete upload the user chose to retry from its passport. */
export interface RetryContext {
  fileId: string;
  fileName: string;
  classification: ClassificationLevel;
  auditNote?: string;
}

let retry: RetryContext | null = null;

export function handOffRetry(ctx: RetryContext) {
  retry = ctx;
}

export function peekRetry() {
  return retry;
}

export function clearRetry() {
  retry = null;
}

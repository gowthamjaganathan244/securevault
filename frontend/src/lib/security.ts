"use client";

import { useEffect, useSyncExternalStore } from "react";
import { ApiError, getFileMacie, getSecurity, runPrivacyScan, type FileMacie, type PrivacyReview } from "./api";
import { auditResource } from "./store";

/**
 * Shared, per-document cache for the two inspection endpoints:
 *   GET /files/{id}/security  (Textract + Comprehend privacy review)
 *   GET /files/{id}/macie     (Amazon Macie batch discovery)
 * The Inspection Lane, Document Passport and Evidence panel all read from
 * here, so a document is fetched once and every view agrees.
 *
 * Entries are keyed by fileId + S3 key: replacing a file changes its key,
 * which makes the old review stale automatically.
 */

export type Load<T> =
  | { k: "idle" }
  | { k: "loading" }
  | { k: "ok"; data: T; at: number }
  | { k: "error"; message: string; status?: number };

export interface SecurityRecord {
  review: PrivacyReview | null;
  versionCount?: number;
}

/** The privacy scan is synchronous on the API; this tracks the in-flight request and its last failure. */
export type ScanState = { k: "idle" } | { k: "running" } | { k: "error"; message: string; status?: number };

const IDLE = { k: "idle" } as const;

function createKeyed<T>(fetcher: (fileId: string) => Promise<T>) {
  const map = new Map<string, Load<T>>();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  const set = (key: string, v: Load<T>) => {
    map.set(key, v);
    emit();
  };

  const load = async (key: string, fileId: string, force = false) => {
    const cur = map.get(key);
    if (!force && cur && (cur.k === "loading" || cur.k === "ok")) return;
    set(key, { k: "loading" });
    try {
      set(key, { k: "ok", data: await fetcher(fileId), at: Date.now() });
    } catch (e) {
      set(key, {
        k: "error",
        message: e instanceof Error ? e.message : "Request failed.",
        status: e instanceof ApiError ? e.status : undefined,
      });
    }
  };

  return {
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    get: (key: string): Load<T> => map.get(key) ?? IDLE,
    set,
    load,
  };
}

const keyOf = (fileId: string, s3Key?: string) => `${fileId}|${s3Key ?? ""}`;

const security = createKeyed<SecurityRecord>(async (id) => {
  const r = await getSecurity(id);
  return { review: r.privacyReview, versionCount: r.versionCount };
});
const macie = createKeyed<FileMacie>(getFileMacie);
const scans = new Map<string, ScanState>();
const scanListeners = new Set<() => void>();
const emitScan = () => scanListeners.forEach((l) => l());

export function useSecurity(fileId: string | undefined, s3Key?: string, enabled = true) {
  const key = fileId ? keyOf(fileId, s3Key) : "";
  const state = useSyncExternalStore(security.subscribe, () => (key ? security.get(key) : IDLE), () => IDLE);
  useEffect(() => {
    if (enabled && fileId) void security.load(key, fileId);
  }, [enabled, fileId, key]);
  return { state, reload: () => fileId && security.load(key, fileId, true) };
}

export function useMacie(fileId: string | undefined, s3Key?: string, enabled = true) {
  const key = fileId ? keyOf(fileId, s3Key) : "";
  const state = useSyncExternalStore(macie.subscribe, () => (key ? macie.get(key) : IDLE), () => IDLE);
  useEffect(() => {
    if (enabled && fileId) void macie.load(key, fileId);
  }, [enabled, fileId, key]);
  return { state, reload: () => fileId && macie.load(key, fileId, true) };
}

export function useScan(fileId: string | undefined, s3Key?: string): ScanState {
  const key = fileId ? keyOf(fileId, s3Key) : "";
  return useSyncExternalStore(
    (l) => {
      scanListeners.add(l);
      return () => scanListeners.delete(l);
    },
    () => (key ? scans.get(key) ?? IDLE : IDLE),
    () => IDLE,
  );
}

/** Runs the real Textract + Comprehend scan and stores the result for every view. */
export async function scanDocument(fileId: string, s3Key?: string) {
  const key = keyOf(fileId, s3Key);
  if (scans.get(key)?.k === "running") return;
  scans.set(key, { k: "running" });
  emitScan();
  try {
    const r = await runPrivacyScan(fileId);
    const prev = security.get(key);
    security.set(key, {
      k: "ok",
      data: { review: r.privacyReview, versionCount: prev.k === "ok" ? prev.data.versionCount : undefined },
      at: Date.now(),
    });
    scans.set(key, IDLE);
    // The API records PRIVACY_SCANNED in the audit log; refresh so the chain shows it.
    void auditResource.load();
  } catch (e) {
    scans.set(key, {
      k: "error",
      message: e instanceof Error ? e.message : "The privacy scan failed.",
      status: e instanceof ApiError ? e.status : undefined,
    });
  }
  emitScan();
}

/**
 * Loads privacy reviews for several documents with a small concurrency cap,
 * so the lane can place documents without a burst of requests.
 */
export async function prefetchSecurity(files: { fileId: string; s3Key?: string }[], concurrency = 3) {
  const queue = files.filter((f) => security.get(keyOf(f.fileId, f.s3Key)).k === "idle");
  const worker = async () => {
    for (let f = queue.shift(); f; f = queue.shift()) await security.load(keyOf(f.fileId, f.s3Key), f.fileId);
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
}

/** Reads cached reviews for many documents at once; re-renders when any of them changes. */
export function useSecurityMap(files: { fileId: string; s3Key?: string }[]) {
  useSyncExternalStore(
    security.subscribe,
    () =>
      files
        .map((f) => {
          const s = security.get(keyOf(f.fileId, f.s3Key));
          return s.k === "ok" ? `o${s.at}` : s.k;
        })
        .join(","),
    () => "",
  );
  return (fileId: string, s3Key?: string) => security.get(keyOf(fileId, s3Key));
}

import type { FileMacie, PrivacyReview } from "./api";
import type { Load, ScanState, SecurityRecord } from "./security";
import type { ClassificationLevel, VaultFile } from "./types";
import { classifications, uploadState } from "./vault";
import type { Tone } from "@/components/ui/primitives";

/**
 * The Inspection Lane, derived only from what the backend records.
 *
 *   Check-in      — DynamoDB record created when the upload link is issued
 *   Storage       — S3 ObjectCreated → EventBridge/Lambda marks it ACTIVE
 *   Inspection    — Textract + Comprehend privacy review (on demand)
 *   Discovery     — Amazon Macie one-time batch job (informational)
 *   Classification— declared level vs the review's recommendation
 *   Archive       — the resulting disposition
 *
 * Rules: a missing result is never shown as healthy; unavailable data stays
 * unavailable; nothing here is invented or animated forward on its own.
 * The backend has no malware scanning and no quarantine state, so neither
 * is ever claimed (see UNSUPPORTED_CHECKS).
 */

export type StageKey = "checkin" | "storage" | "inspection" | "discovery" | "classification" | "archive";

/**
 * complete    – the step happened and its evidence exists
 * active      – genuinely in progress right now
 * attention   – happened, and its result needs a person
 * blocked     – failed or cannot proceed
 * pending     – hasn't happened (not started, or waiting on an earlier step)
 * unavailable – the information can't be obtained or doesn't apply
 */
export type StageStatus = "complete" | "active" | "attention" | "blocked" | "pending" | "unavailable";

export interface Stage {
  key: StageKey;
  label: string;
  status: StageStatus;
  tone: Tone;
  headline: string;
  detail: string;
  at?: string;
}

export const STAGE_LABEL: Record<StageKey, string> = {
  checkin: "Check-in",
  storage: "Storage",
  inspection: "Inspection",
  discovery: "Discovery",
  classification: "Classification",
  archive: "Archive",
};

export const statusLabel: Record<StageStatus, string> = {
  complete: "Complete",
  active: "In progress",
  attention: "Needs review",
  blocked: "Failed",
  pending: "Not started",
  unavailable: "Unavailable",
};

/** Checks people may expect from a screening system that this backend does not perform. */
export const UNSUPPORTED_CHECKS = [
  {
    label: "Malware scanning",
    detail: "Not part of this vault's backend. No document is ever shown as malware-free.",
  },
  {
    label: "Quarantine",
    detail: "The backend has no quarantine state. Documents with findings stay in the archive, flagged for review.",
  },
] as const;

export const isPdf = (f: Pick<VaultFile, "fileName" | "contentType">) =>
  /\.pdf$/i.test(f.fileName) || f.contentType === "application/pdf";

/** The privacy review supports small, single-page English PDFs only. */
export const SCAN_SUPPORT = "Supports small, single-page English PDFs.";

const piiCount = (r: PrivacyReview) => r.piiTypes?.length ?? 0;

export function recommendedLevel(r: PrivacyReview | null | undefined): ClassificationLevel | undefined {
  return classifications.find((c) => c === r?.recommendedClassification);
}

export interface InspectionInput {
  file: VaultFile;
  security?: Load<SecurityRecord>;
  scan?: ScanState;
  macie?: Load<FileMacie>;
}

/* ── Individual stages ─────────────────────────────────────────────── */

function checkin(file: VaultFile): Stage {
  return {
    key: "checkin",
    label: STAGE_LABEL.checkin,
    status: "complete",
    tone: "success",
    headline: "Checked in",
    detail: `Identity ${shortId(file.fileId)} assigned, declared ${file.classification}${file.uploadedBy ? ` by ${file.uploadedBy}` : ""}.`,
    at: file.createdAt,
  };
}

function storage(file: VaultFile): Stage {
  const base = { key: "storage" as const, label: STAGE_LABEL.storage };
  switch (uploadState(file)) {
    case "stored":
      return { ...base, status: "complete", tone: "success", headline: "Stored in private S3", detail: "S3 confirmed the object to the vault.", at: file.uploadedAt };
    case "awaiting":
      return { ...base, status: "active", tone: "info", headline: "Awaiting S3 confirmation", detail: "An upload link was issued. S3 hasn't reported the object yet." };
    case "not-received":
      return {
        ...base,
        status: "blocked",
        tone: "warning",
        headline: "Not received",
        detail: "An upload link was issued, but S3 never confirmed a file. The transfer likely didn't finish.",
      };
    default:
      return { ...base, status: "unavailable", tone: "neutral", headline: "Unrecognised status", detail: `The record's status (${file.status || "empty"}) isn't one this app knows.` };
  }
}

function inspection(file: VaultFile, sec?: Load<SecurityRecord>, scan?: ScanState): Stage {
  const base = { key: "inspection" as const, label: STAGE_LABEL.inspection };
  if (uploadState(file) !== "stored") {
    return { ...base, status: "pending", tone: "muted", headline: "Waits for storage", detail: "Inspection can run once S3 confirms the file." };
  }
  if (scan?.k === "running") {
    return { ...base, status: "active", tone: "info", headline: "Inspecting", detail: "Amazon Textract is extracting text and Comprehend is checking it for personal data." };
  }
  if (scan?.k === "error") {
    return { ...base, status: "blocked", tone: "danger", headline: "Inspection failed", detail: scan.message };
  }
  if (!sec || sec.k === "idle" || sec.k === "loading") {
    return { ...base, status: "pending", tone: "muted", headline: "Checking record", detail: "Loading the inspection record for this document." };
  }
  if (sec.k === "error") {
    return { ...base, status: "unavailable", tone: "neutral", headline: "Inspection record unavailable", detail: sec.message };
  }
  const r = sec.data.review;
  if (!r) {
    return isPdf(file)
      ? { ...base, status: "pending", tone: "muted", headline: "Not inspected", detail: `No privacy review has been run. ${SCAN_SUPPORT}` }
      : { ...base, status: "unavailable", tone: "muted", headline: "Not supported for this type", detail: `The privacy review can't read this file. ${SCAN_SUPPORT}` };
  }
  const partial = r.partialTextReview ? " Only part of the text was reviewed." : "";
  if (r.status === "REVIEW_REQUIRED") {
    return { ...base, status: "attention", tone: "warning", headline: "Review required", detail: `The privacy review asked for a person to check this document.${partial}`, at: r.scannedAt };
  }
  if (piiCount(r) > 0) {
    return {
      ...base,
      status: "attention",
      tone: "warning",
      headline: `Personal data found · ${piiCount(r)} type${piiCount(r) === 1 ? "" : "s"}`,
      detail: `Comprehend detected personal data in the extracted text.${partial}`,
      at: r.scannedAt,
    };
  }
  if (r.status === "COMPLETE") {
    return {
      ...base,
      status: "complete",
      tone: "success",
      headline: "No personal data found",
      detail: `Nothing detected in the reviewed text.${partial} This isn't a guarantee the file is harmless.`,
      at: r.scannedAt,
    };
  }
  return { ...base, status: "unavailable", tone: "neutral", headline: `Review status: ${r.status}`, detail: "The privacy review returned a status this app doesn't recognise.", at: r.scannedAt };
}

function discovery(file: VaultFile, m?: Load<FileMacie>): Stage {
  const base = { key: "discovery" as const, label: STAGE_LABEL.discovery };
  if (uploadState(file) !== "stored") {
    return { ...base, status: "pending", tone: "muted", headline: "Waits for storage", detail: "Macie only sees objects that are stored." };
  }
  if (!m || m.k === "idle" || m.k === "loading") {
    return { ...base, status: "pending", tone: "muted", headline: "Checking Macie", detail: "Loading Amazon Macie coverage for this document." };
  }
  if (m.k === "error") {
    return { ...base, status: "unavailable", tone: "neutral", headline: "Macie results unavailable", detail: m.message };
  }
  const r = m.data;
  const failed = !!r.lastRunError && r.lastRunError !== "NONE";
  const jobAt = r.createdAt ? Date.parse(r.createdAt) : NaN;
  const afterJob = !!file.uploadedAt && Number.isFinite(jobAt) && Date.parse(file.uploadedAt) > jobAt;
  if (!r.coveredByJobScope) {
    return { ...base, status: "unavailable", tone: "muted", headline: "Outside Macie scope", detail: "This file's storage location isn't covered by the Macie job." };
  }
  if (failed) {
    return { ...base, status: "blocked", tone: "danger", headline: "Macie job failed", detail: `The job reported ${r.lastRunError}. No Macie results exist for this document.` };
  }
  if (afterJob) {
    return {
      ...base,
      status: "unavailable",
      tone: "muted",
      headline: "Not covered by Macie",
      detail: "Uploaded after the one-time discovery job ran, so Macie hasn't checked this version.",
    };
  }
  if (r.jobStatus !== "COMPLETE") {
    return { ...base, status: "active", tone: "info", headline: "Macie job not complete", detail: "Findings may still appear when the discovery job finishes." };
  }
  if ((r.findingCount ?? 0) > 0) {
    return {
      ...base,
      status: "attention",
      tone: "warning",
      headline: `${r.findingCount} Macie finding${r.findingCount === 1 ? "" : "s"}`,
      detail: "Macie flagged sensitive data. The privacy level isn't changed automatically.",
    };
  }
  return {
    ...base,
    status: "complete",
    tone: "neutral",
    headline: "No findings reported",
    detail: "Macie reported nothing for this object. That isn't proof it's safe.",
  };
}

function classification(file: VaultFile, sec?: Load<SecurityRecord>): Stage {
  const base = { key: "classification" as const, label: STAGE_LABEL.classification };
  const rec = sec?.k === "ok" ? recommendedLevel(sec.data.review) : undefined;
  if (!rec) {
    return {
      ...base,
      status: "pending",
      tone: "muted",
      headline: `Declared ${file.classification}`,
      detail: "Set by the uploader. No inspection recommendation to compare against.",
    };
  }
  const declared = classifications.indexOf(file.classification);
  const suggested = classifications.indexOf(rec);
  if (declared === suggested) {
    return { ...base, status: "complete", tone: "success", headline: `${file.classification} · matches inspection`, detail: "The declared level agrees with the privacy review." };
  }
  if (declared < suggested) {
    return {
      ...base,
      status: "attention",
      tone: "warning",
      headline: `Declared ${file.classification}, inspection suggests ${rec}`,
      detail: "The declared level is lower than the review recommends.",
    };
  }
  return {
    ...base,
    status: "complete",
    tone: "neutral",
    headline: `Declared ${file.classification}`,
    detail: `Stricter than the review's ${rec} recommendation.`,
  };
}

function archive(file: VaultFile, insp: Stage, cls: Stage, disc?: Stage): Stage {
  const base = { key: "archive" as const, label: STAGE_LABEL.archive };
  const state = uploadState(file);
  if (state === "not-received") {
    return { ...base, status: "blocked", tone: "warning", headline: "Held · never arrived", detail: "Not archived. The owner or an Admin can re-upload it." };
  }
  if (state === "awaiting") {
    return { ...base, status: "pending", tone: "muted", headline: "Archives on confirmation", detail: "Enters the archive once S3 confirms the file." };
  }
  if (state === "unknown") {
    return { ...base, status: "unavailable", tone: "neutral", headline: "Disposition unknown", detail: "The record's status isn't recognised." };
  }
  if (insp.status === "attention" || cls.status === "attention" || disc?.status === "attention") {
    return { ...base, status: "attention", tone: "warning", headline: "Archived · flagged for review", detail: "Stored and available, with inspection results that need a person." };
  }
  if (insp.status === "complete") {
    return { ...base, status: "complete", tone: "success", headline: "Archived · inspected", detail: "Stored privately with a completed privacy review.", at: file.uploadedAt };
  }
  return {
    ...base,
    status: "complete",
    tone: "neutral",
    headline: "Archived · not inspected",
    detail: "Stored privately. No privacy review evidence exists yet.",
    at: file.uploadedAt,
  };
}

/* ── Public API ────────────────────────────────────────────────────── */

/** The full lane for one document. Discovery is included only when Macie data was requested. */
export function inspectionLane({ file, security, scan, macie }: InspectionInput): Stage[] {
  const c = checkin(file);
  const s = storage(file);
  const i = inspection(file, security, scan);
  const d = macie ? discovery(file, macie) : undefined;
  const k = classification(file, security);
  const a = archive(file, i, k, d);
  return d ? [c, s, i, d, k, a] : [c, s, i, k, a];
}

/** Where a document sits on the facility-wide lane board. */
export type LanePosition = "arrival" | "held" | "uninspected" | "review" | "archived";

export const LANE_POSITIONS: { key: LanePosition; label: string; caption: string; tone: Tone }[] = [
  { key: "arrival", label: "Arrival", caption: "Checked in, awaiting S3", tone: "info" },
  { key: "uninspected", label: "Stored · not inspected", caption: "No privacy review yet", tone: "muted" },
  { key: "review", label: "Flagged for review", caption: "Findings or level mismatch", tone: "warning" },
  { key: "archived", label: "Archived · inspected", caption: "Review complete, nothing found", tone: "success" },
];

export function lanePosition(file: VaultFile, security?: Load<SecurityRecord>): LanePosition {
  const st = uploadState(file);
  if (st === "awaiting") return "arrival";
  if (st !== "stored") return "held";
  const i = inspection(file, security);
  const k = classification(file, security);
  if (i.status === "attention" || k.status === "attention") return "review";
  if (i.status === "complete") return "archived";
  return "uninspected";
}

/** How far along the lane a document is, as a share of stages complete (for the lit rail). */
export function laneProgress(stages: Stage[]) {
  let lit = 0;
  for (const s of stages) {
    if (s.status === "complete" || s.status === "attention") lit++;
    else break;
  }
  return stages.length ? lit / stages.length : 0;
}

export function shortId(id: string) {
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CircleSlash, Loader2, RotateCw, ScanText, Square, Volume2 } from "lucide-react";
import { getPrivacyVoice, updateMetadata } from "@/lib/api";
import { filesResource, useAudit } from "@/lib/store";
import { scanDocument, useMacie, useScan, useSecurity } from "@/lib/security";
import { isPdf, recommendedLevel, SCAN_SUPPORT, inspectionLane, UNSUPPORTED_CHECKS } from "@/lib/inspection";
import { formatBytes, formatFull, titleCase } from "@/lib/format";
import { uploadState } from "@/lib/vault";
import type { UserRole, VaultFile } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { DataRow, StatusPill, type Tone } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { ClassificationTag } from "@/components/vault/tags";
import { JobBadge } from "@/components/vault/MacieResult";
import { toneText } from "./Lane";

const piiLabel = (t: string) => t.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** "SensitiveData:S3Object/Personal" → "Personal (sensitive data)" */
function findingLabel(type: string) {
  const [family, rest = ""] = type.split(":");
  const tail = rest.split("/").pop() || rest || family;
  const fam = family === "SensitiveData" ? "sensitive data" : family === "Policy" ? "policy" : family.toLowerCase();
  return `${tail} (${fam})`;
}

/**
 * The eight evidence states the report distinguishes. "Queued" and
 * "Quarantined" don't exist in this backend, so they're listed under
 * "Not performed by this vault" instead of being simulated.
 */
type EvidenceState = "not-stored" | "loading" | "not-scanned" | "unsupported" | "processing" | "no-findings" | "findings" | "failed" | "unavailable";

const evidenceCopy: Record<EvidenceState, { label: string; tone: Tone }> = {
  "not-stored": { label: "Waits for storage", tone: "muted" },
  loading: { label: "Loading", tone: "muted" },
  "not-scanned": { label: "Not scanned", tone: "muted" },
  unsupported: { label: "Not supported", tone: "muted" },
  processing: { label: "Processing", tone: "info" },
  "no-findings": { label: "Completed · no findings", tone: "success" },
  findings: { label: "Findings detected", tone: "warning" },
  failed: { label: "Failed", tone: "danger" },
  unavailable: { label: "Unavailable", tone: "neutral" },
};

export function InspectionEvidence({
  file,
  canEdit,
  role,
  autoScan,
}: {
  file: VaultFile;
  canEdit: boolean;
  role: UserRole;
  /** Run the scan once if no review exists yet (used straight after check-in). */
  autoScan?: boolean;
}) {
  const toast = useToast();
  const stored = uploadState(file) === "stored";
  const { state: sec, reload } = useSecurity(file.fileId, file.s3Key, stored);
  const scan = useScan(file.fileId, file.s3Key);
  const { state: macie, reload: reloadMacie } = useMacie(file.fileId, file.s3Key, stored);
  const { events } = useAudit();
  const [voice, setVoice] = useState<"idle" | "loading" | "playing">("idle");
  const [applying, setApplying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const autoRan = useRef(false);

  const review = sec.k === "ok" ? sec.data.review : null;
  const recommended = recommendedLevel(review);
  const stages = inspectionLane({ file, security: sec, scan, macie });
  const discovery = stages.find((s) => s.key === "discovery");

  const state: EvidenceState = !stored
    ? "not-stored"
    : scan.k === "running"
      ? "processing"
      : scan.k === "error"
        ? "failed"
        : sec.k === "idle" || sec.k === "loading"
          ? "loading"
          : sec.k === "error"
            ? "unavailable"
            : !review
              ? isPdf(file)
                ? "not-scanned"
                : "unsupported"
              : review.status === "REVIEW_REQUIRED" || (review.piiTypes?.length ?? 0) > 0
                ? "findings"
                : review.status === "COMPLETE"
                  ? "no-findings"
                  : "unavailable";

  useEffect(() => {
    if (autoScan && !autoRan.current && sec.k === "ok" && !sec.data.review && isPdf(file)) {
      autoRan.current = true;
      void scanDocument(file.fileId, file.s3Key);
    }
  }, [autoScan, sec, file]);

  // Stop audio and release the object URL when leaving.
  useEffect(
    () => () => {
      audioRef.current?.pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const playVoice = async () => {
    if (voice === "playing") {
      audioRef.current?.pause();
      setVoice("idle");
      return;
    }
    setVoice("loading");
    try {
      const blob = await getPrivacyVoice(file.fileId);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = URL.createObjectURL(blob);
      const audio = new Audio(urlRef.current);
      audioRef.current = audio;
      audio.onended = () => setVoice("idle");
      audio.onerror = () => setVoice("idle");
      await audio.play();
      setVoice("playing");
    } catch (e) {
      setVoice("idle");
      toast({ tone: "danger", title: "Spoken guidance unavailable", body: e instanceof Error ? e.message : undefined });
    }
  };

  const apply = async () => {
    if (!recommended) return;
    setApplying(true);
    try {
      await updateMetadata(file.fileId, { classification: recommended });
      await filesResource.load();
      toast({ tone: "success", title: `Privacy level set to ${recommended}` });
    } catch (e) {
      toast({ tone: "danger", title: "Couldn't change the privacy level", body: e instanceof Error ? e.message : undefined });
    } finally {
      setApplying(false);
    }
  };

  const refs = events.filter((e) => e.fileId === file.fileId && ["PRIVACY_SCANNED", "METADATA_UPDATED", "FILE_REPLACED"].includes(e.action)).slice(0, 5);
  const copy = evidenceCopy[state];

  return (
    <div className="space-y-4 text-[12.5px]">
      {/* ── Privacy review ─────────────────────────────── */}
      <Block
        title="Privacy review"
        source="Amazon Textract + Amazon Comprehend · on demand"
        status={
          <StatusPill tone={copy.tone} pulse={state === "processing"}>
            {copy.label}
          </StatusPill>
        }
      >
        {state === "processing" && (
          <p className="flex items-center gap-2 text-ink-2" role="status">
            <Loader2 className="size-3.5 animate-spin" /> Extracting text and checking it for personal data…
          </p>
        )}
        {state === "loading" && (
          <p className="flex items-center gap-2 text-ink-3" role="status">
            <Loader2 className="size-3.5 animate-spin" /> Loading the inspection record…
          </p>
        )}
        {state === "not-stored" && <p className="text-ink-3">Inspection can run once S3 confirms the file.</p>}
        {state === "not-scanned" && <p className="text-ink-3">No privacy review has been run on this document. {SCAN_SUPPORT}</p>}
        {state === "unsupported" && <p className="text-ink-3">This file type can&apos;t be reviewed. {SCAN_SUPPORT}</p>}
        {state === "unavailable" && (
          <p className="text-ink-2" role="alert">
            {sec.k === "error" ? sec.message : "The review returned a status this app doesn't recognise."}
          </p>
        )}
        {state === "failed" && scan.k === "error" && (
          <p className="text-danger" role="alert">
            {scan.message}
          </p>
        )}

        {review && state !== "processing" && (
          <dl className="divide-y divide-line">
            <DataRow label="Result">
              <span className={toneText[copy.tone]}>{review.status === "COMPLETE" ? "Review complete" : review.status === "REVIEW_REQUIRED" ? "Review required" : review.status}</span>
            </DataRow>
            <DataRow label="Personal data">
              {review.piiTypes && review.piiTypes.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5">
                  {review.piiTypes.map((t) => (
                    <li key={t} className="rounded-md border border-warning/35 bg-warning/[0.08] px-1.5 py-0.5 text-[11.5px] text-warning">
                      {piiLabel(t)}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-ink-2">None detected in the reviewed text</span>
              )}
            </DataRow>
            <DataRow label="Recommends">
              {recommended ? (
                <span className="flex flex-wrap items-center gap-2">
                  <ClassificationTag level={recommended} compact />
                  {recommended === file.classification ? (
                    <span className="text-[11.5px] text-ink-3">matches the declared level</span>
                  ) : canEdit ? (
                    <button type="button" onClick={apply} disabled={applying} className="font-medium text-primary-hi hover:text-foreground disabled:opacity-50">
                      {applying ? "Applying…" : `Apply ${recommended}`}
                    </button>
                  ) : (
                    <span className="text-[11.5px] text-ink-3">declared {file.classification}</span>
                  )}
                </span>
              ) : (
                <span className="text-ink-3">No recommendation returned</span>
              )}
            </DataRow>
            <DataRow label="Reviewed">
              {review.reviewedTextCharacters !== undefined ? `${review.reviewedTextCharacters.toLocaleString()} characters` : "Not reported"}
              {review.partialTextReview && <span className="text-warning"> · partial review</span>}
            </DataRow>
            <DataRow label="Scanned">{review.scannedAt ? formatFull(review.scannedAt) : "Not recorded"}</DataRow>
            <DataRow label="Engine" mono>
              {review.engine ?? "Textract+Comprehend"}
            </DataRow>
          </dl>
        )}

        {stored && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => void scanDocument(file.fileId, file.s3Key)} disabled={state === "processing" || state === "loading"}>
              <ScanText /> {review ? "Scan again" : "Run privacy scan"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={playVoice}
              disabled={!review || voice === "loading"}
              aria-pressed={voice === "playing"}
              title={review ? "Amazon Polly reads the privacy advice aloud" : "Available after a successful scan"}
            >
              {voice === "loading" ? <Loader2 className="animate-spin" /> : voice === "playing" ? <Square /> : <Volume2 />}
              {voice === "playing" ? "Stop" : "Hear advice"}
            </Button>
            {state === "unavailable" && sec.k === "error" && (
              <Button size="sm" variant="ghost" onClick={() => reload()}>
                <RotateCw /> Retry
              </Button>
            )}
          </div>
        )}
        <p className="mt-2.5 text-[11px] text-ink-3">Raw personal data is never stored or shown, only the types detected.</p>
      </Block>

      {/* ── Macie ──────────────────────────────────────── */}
      <Block
        title="Sensitive-data discovery"
        source="Amazon Macie · one-time batch job"
        status={macie.k === "ok" ? <JobBadge jobStatus={macie.data.jobStatus} lastRunError={macie.data.lastRunError} /> : undefined}
      >
        {discovery && (
          <>
            <p className={cn("font-medium", toneText[discovery.tone])}>{discovery.headline}</p>
            <p className="mt-0.5 text-ink-3">{discovery.detail}</p>
          </>
        )}
        {macie.k === "ok" && macie.data.coveredByJobScope && ((macie.data.findingTypes?.length ?? 0) > 0 || (macie.data.findingSeverities?.length ?? 0) > 0) && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {(macie.data.findingTypes ?? []).map((t) => (
              <li key={t} className="rounded-md border border-warning/35 bg-warning/[0.08] px-1.5 py-0.5 text-[11.5px] text-warning">
                {findingLabel(t)}
              </li>
            ))}
            {(macie.data.findingSeverities ?? []).map((s) => (
              <li key={s} className="rounded-md border border-line-strong px-1.5 py-0.5 text-[11.5px] text-ink-2">
                Severity: {s.toLowerCase()}
              </li>
            ))}
          </ul>
        )}
        {macie.k === "ok" && (
          <p className="mt-2 text-[11px] text-ink-3">
            {macie.data.createdAt ? `Job started ${formatFull(macie.data.createdAt)}` : "Job start not recorded"}
            {macie.data.resultsTruncated && " · only the first 250 job findings were checked"} · results never change the privacy level
          </p>
        )}
        {macie.k === "error" && (
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => reloadMacie()}>
            <RotateCw /> Retry
          </Button>
        )}
      </Block>

      {/* ── Honest gaps ────────────────────────────────── */}
      <Block title="Not performed by this vault" source="Shown so absence is never mistaken for a pass">
        <ul className="space-y-2">
          {UNSUPPORTED_CHECKS.map((c) => (
            <li key={c.label} className="flex items-start gap-2">
              <CircleSlash className="mt-0.5 size-3.5 shrink-0 text-ink-3" aria-hidden />
              <span>
                <span className="font-medium text-ink-2">{c.label}</span>
                <span className="text-ink-3"> · {c.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </Block>

      {/* ── Source metadata & audit references ─────────── */}
      <Block title="Source metadata" source="DynamoDB document record">
        <dl className="divide-y divide-line">
          <DataRow label="Content type" mono>
            {file.contentType || "Not recorded"}
          </DataRow>
          <DataRow label="Object size">{file.objectSize !== undefined ? `${formatBytes(file.objectSize)} · ${file.objectSize.toLocaleString()} bytes` : "Known after S3 confirms"}</DataRow>
          <DataRow label="Link issued">{formatFull(file.createdAt)}</DataRow>
          <DataRow label="S3 confirmed">{file.uploadedAt ? formatFull(file.uploadedAt) : "Not yet"}</DataRow>
          {sec.k === "ok" && sec.data.versionCount !== undefined && <DataRow label="Versions">{sec.data.versionCount}</DataRow>}
          {role === "Admin" && file.s3Key && (
            <DataRow label="Object key" mono>
              {file.s3Key}
            </DataRow>
          )}
        </dl>
        <p className="eyebrow mb-1.5 mt-3">Audit references</p>
        {refs.length === 0 ? (
          <p className="text-ink-3">No scan, metadata or replacement events recorded for this document in the audit log you can see.</p>
        ) : (
          <ul className="space-y-1.5">
            {refs.map((e) => (
              <li key={e.auditId} className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-ink-2">{titleCase(e.action)}</span>
                <span className="font-mono text-[11px] text-ink-3" title={formatFull(e.timestamp)}>
                  {e.auditId.slice(0, 18)}
                  {e.auditId.length > 18 ? "…" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Block>
    </div>
  );
}

function Block({ title, source, status, children }: { title: string; source: string; status?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface-1/60 p-3.5">
      <header className="mb-2.5 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-[13px] font-semibold text-foreground">{title}</h4>
          <p className="text-[11px] text-ink-3">{source}</p>
        </div>
        {status}
      </header>
      {children}
    </section>
  );
}

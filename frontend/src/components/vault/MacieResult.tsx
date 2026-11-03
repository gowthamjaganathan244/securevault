"use client";

import { useEffect, useState } from "react";
import { CircleAlert, Loader2 } from "lucide-react";
import { getFileMacie, getMacieStatus, type FileMacie, type MacieStatus } from "@/lib/api";
import { formatFull } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Amazon Macie is asynchronous, one-time batch S3 discovery — separate from the
 * real-time Textract + Comprehend review. Results are informational only: they
 * never change a classification, and "no findings" is never presented as safe.
 */

type Tone = "info" | "success" | "danger" | "warning" | "neutral";

export function jobState(jobStatus: string, lastRunError?: string): { label: string; tone: Tone } {
  if (lastRunError && lastRunError !== "NONE") return { label: "Failed", tone: "danger" };
  switch (jobStatus) {
    case "RUNNING":
      return { label: "Running", tone: "info" };
    case "COMPLETE":
      return { label: "Complete", tone: "success" };
    case "PAUSED":
    case "USER_PAUSED":
      return { label: "Paused", tone: "warning" };
    case "CANCELLED":
      return { label: "Cancelled", tone: "neutral" };
    case "IDLE":
      return { label: "Idle", tone: "neutral" };
    default:
      return { label: jobStatus ? jobStatus.toLowerCase().replace(/_/g, " ") : "Unknown", tone: "neutral" };
  }
}

const toneCls: Record<Tone, string> = {
  info: "bg-primary/12 text-primary-hi",
  success: "bg-success/12 text-success",
  danger: "bg-danger/12 text-danger",
  warning: "bg-warning/12 text-warning",
  neutral: "bg-white/[0.06] text-ink-2",
};

export function JobBadge({ jobStatus, lastRunError }: { jobStatus: string; lastRunError?: string }) {
  const s = jobState(jobStatus, lastRunError);
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium", toneCls[s.tone])}>
      {s.tone === "info" ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {s.label}
    </span>
  );
}

/** "SensitiveData:S3Object/Personal" → "Personal (sensitive data)" */
function findingLabel(type: string) {
  const [family, rest = ""] = type.split(":");
  const tail = rest.split("/").pop() || rest || family;
  const fam = family === "SensitiveData" ? "sensitive data" : family === "Policy" ? "policy" : family.toLowerCase();
  return `${tail} (${fam})`;
}

/** Per-document Macie summary for Privacy Guardian / Document Passport. */
export function FileMacieCard({ fileId, uploadedAt }: { fileId: string; uploadedAt?: string }) {
  const [state, setState] = useState<{ k: "loading" } | { k: "error"; message: string } | { k: "ok"; r: FileMacie }>({ k: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    getFileMacie(fileId)
      .then((r) => alive && setState({ k: "ok", r }))
      .catch((e: unknown) => alive && setState({ k: "error", message: e instanceof Error ? e.message : "Couldn't load Macie results." }));
    return () => {
      alive = false;
    };
  }, [fileId, attempt]);

  if (state.k === "loading")
    return (
      <p className="flex items-center gap-2 text-[12px] text-ink-3" role="status">
        <Loader2 className="size-3.5 animate-spin" /> Checking Amazon Macie…
      </p>
    );
  if (state.k === "error")
    return (
      <p className="flex items-start gap-2 text-[12px] text-danger" role="alert">
        <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
        <span className="flex-1">{state.message}</span>
        <button
          type="button"
          className="font-medium text-primary-hi hover:text-white"
          onClick={() => {
            setState({ k: "loading" });
            setAttempt((a) => a + 1);
          }}
        >
          Retry
        </button>
      </p>
    );

  const r = state.r;
  const failed = !!r.lastRunError && r.lastRunError !== "NONE";
  const jobRanAt = r.createdAt ? Date.parse(r.createdAt) : NaN;
  const uploadedAfterJob = !!uploadedAt && Number.isFinite(jobRanAt) && Date.parse(uploadedAt) > jobRanAt;

  let headline: string;
  let detail: string;
  let tone: Tone = "neutral";
  if (!r.coveredByJobScope) {
    headline = "Not scanned by Macie";
    detail = "This file's storage location is outside the Macie job's scope.";
  } else if (failed) {
    headline = `Macie job failed (${r.lastRunError})`;
    detail = "No Macie results are available for this document.";
    tone = "danger";
  } else if (uploadedAfterJob) {
    headline = "Uploaded after the Macie job ran";
    detail = "The one-time job only scanned files that existed when it ran, so this version hasn't been checked by Macie.";
    tone = "warning";
  } else if (r.jobStatus !== "COMPLETE") {
    headline = "Macie results pending";
    detail = "The discovery job hasn't completed, so findings may still appear.";
    tone = "info";
  } else if ((r.findingCount ?? 0) > 0) {
    headline = `${r.findingCount} Macie finding${r.findingCount === 1 ? "" : "s"}`;
    detail = "Macie flagged sensitive data in this document. Review its privacy level — it isn't changed automatically.";
    tone = "warning";
  } else {
    headline = "No findings reported";
    detail = "This isn't proof the document is safe: Macie may report findings later, and it only checks the data types it's configured for.";
  }

  return (
    <div className="space-y-2 rounded-xl border border-line bg-surface-1 p-3 text-[12.5px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={cn("font-medium", tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : tone === "info" ? "text-primary-hi" : "text-foreground")}>
          {headline}
        </span>
        <JobBadge jobStatus={r.jobStatus} lastRunError={r.lastRunError} />
      </div>
      <p className="text-ink-3">{detail}</p>
      {r.coveredByJobScope && (r.findingTypes?.length ?? 0) > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {r.findingTypes!.map((t) => (
            <li key={t} className="rounded-md border border-warning/30 bg-warning/[0.08] px-1.5 py-0.5 text-[11.5px] text-warning">
              {findingLabel(t)}
            </li>
          ))}
          {(r.findingSeverities ?? []).map((s) => (
            <li key={s} className="rounded-md border border-line-strong px-1.5 py-0.5 text-[11.5px] text-ink-2">
              Severity: {s.toLowerCase()}
            </li>
          ))}
        </ul>
      )}
      {r.resultsTruncated && <p className="text-[11px] text-ink-3">Only the first 250 job findings were checked.</p>}
      <p className="text-[11px] text-ink-3">
        Batch discovery{r.createdAt ? ` · job started ${formatFull(r.createdAt)}` : ""} · no sensitive values are shown
      </p>
    </div>
  );
}

/** Admin-wide Macie job status (People & Access security area). */
export function MacieStatusPanel() {
  const [state, setState] = useState<{ k: "loading" } | { k: "error"; message: string } | { k: "ok"; s: MacieStatus }>({ k: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    getMacieStatus()
      .then((s) => alive && setState({ k: "ok", s }))
      .catch((e: unknown) => alive && setState({ k: "error", message: e instanceof Error ? e.message : "Couldn't load Macie status." }));
    return () => {
      alive = false;
    };
  }, [attempt]);

  if (state.k === "loading")
    return (
      <p className="flex items-center gap-2 p-4 text-[12.5px] text-ink-3" role="status">
        <Loader2 className="size-3.5 animate-spin" /> Loading Amazon Macie status…
      </p>
    );
  if (state.k === "error")
    return (
      <p className="flex items-start gap-2 p-4 text-[12.5px] text-danger" role="alert">
        <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
        <span className="flex-1">{state.message}</span>
        <button
          type="button"
          className="font-medium text-primary-hi hover:text-white"
          onClick={() => {
            setState({ k: "loading" });
            setAttempt((a) => a + 1);
          }}
        >
          Retry
        </button>
      </p>
    );

  const s = state.s;
  return (
    <div className="space-y-3 p-4 text-[12.5px]">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="font-medium text-foreground">{s.provider}</span>
        <JobBadge jobStatus={s.jobStatus} lastRunError={s.lastRunError} />
        <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-medium", s.configured ? "bg-success/12 text-success" : "bg-white/[0.06] text-ink-2")}>
          {s.configured ? "Configured" : "Not configured"}
        </span>
      </div>
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        <Row label="Mode">{s.mode}</Row>
        <Row label="Job type">{s.jobType.toLowerCase().replace(/_/g, " ")}</Row>
        <Row label="Started">{s.createdAt ? formatFull(s.createdAt) : "—"}</Row>
        <Row label="Findings">
          {s.findingCount}
          {s.findingsTruncated ? "+ (truncated)" : ""}
        </Row>
        <Row label="Last run error">{s.lastRunError === "NONE" ? "None" : <span className="text-danger">{s.lastRunError}</span>}</Row>
        <Row label="Scope">{s.scope.join(", ")}</Row>
        <Row label="Job ID">
          <span className="break-all font-mono text-[11px]">{s.jobId}</span>
        </Row>
      </dl>
      <p className="rounded-lg border border-warning/25 bg-warning/[0.06] px-3 py-2 text-[12px] text-ink-2">{s.notice}</p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-28 shrink-0 text-ink-3">{label}</dt>
      <dd className="min-w-0 text-ink-2">{children}</dd>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpFromLine, Check, CircleAlert, CircleCheck, Clock, FileCheck2, Loader2, RotateCw, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/session";
import { filesResource } from "@/lib/store";
import { putToS3, requestUploadUrl, type UploadTicket } from "@/lib/api";
import { formatBytes, formatFinderDate, formatFull } from "@/lib/format";
import { clearRetry, peekRetry, takeHandedOffFile } from "@/lib/handoff";
import { inspectionLane, isPdf, shortId } from "@/lib/inspection";
import { useScan, useSecurity } from "@/lib/security";
import { PrivacyGuardian } from "@/components/upload/PrivacyGuardian";
import { InspectionEvidence } from "@/components/inspection/Evidence";
import { InspectionLane } from "@/components/inspection/Lane";
import { ACCEPTED_EXTENSIONS, classificationCopy, classifications, fileKind, kindLabel, validateUpload } from "@/lib/vault";
import type { ClassificationLevel, VaultFile } from "@/lib/types";
import { PageToolbar } from "@/components/shell/PageToolbar";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Notice, StatusPill, type Tone } from "@/components/ui/primitives";
import { ClassificationTag, FileGlyph, TierMark, alpha, classificationHex, classificationStyle } from "@/components/vault/tags";

type Stage = 1 | 2 | 3;
type Phase = "link" | "transfer" | "confirm";
type RunState =
  | { kind: "idle" }
  | { kind: "running"; phase: Phase }
  | { kind: "error"; phase: Phase; message: string }
  | { kind: "unconfirmed" }
  | { kind: "done"; record: VaultFile };

const TICKET_REUSE_MS = 4 * 60_000;
const CONFIRM_TIMEOUT_MS = 60_000;

export function UploadStudio() {
  const { email } = useSession();
  const [stage, setStage] = useState<Stage>(1);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // A retry from a passport pre-fills the earlier attempt's privacy level and note.
  const [retry, setRetry] = useState(() => peekRetry());
  const [level, setLevel] = useState<ClassificationLevel>(() => peekRetry()?.classification ?? "Internal");
  const [note, setNote] = useState(() => peekRetry()?.auditNote ?? "");
  const [run, setRun] = useState<RunState>({ kind: "idle" });
  const [progress, setProgress] = useState({ loaded: 0, total: 0, rate: 0 });
  const [dragging, setDragging] = useState(false);
  // The document identifier the vault assigned when it issued the upload link.
  const [assignedId, setAssignedId] = useState<string | null>(null);

  const ticketRef = useRef<{ ticket: UploadTicket; at: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const previewRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const handoffChecked = useRef(false);

  const choose = useCallback((next: File | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
    ticketRef.current = null;
    setAssignedId(null);
    setRun({ kind: "idle" });
    setFile(next);
    if (!next) {
      setFileError(null);
      setPreviewUrl(null);
      return;
    }
    const problem = validateUpload(next);
    setFileError(problem);
    const kind = fileKind(next.name, next.type);
    if (!problem && kind === "pdf") {
      previewRef.current = URL.createObjectURL(next);
    }
    setPreviewUrl(previewRef.current);
  }, []);

  // A file dropped on the Inspection Lane arrives here; pick it up once.
  useEffect(() => {
    if (handoffChecked.current) return;
    handoffChecked.current = true;
    const handed = takeHandedOffFile();
    if (handed) queueMicrotask(() => choose(handed));
  }, [choose]);

  useEffect(() => clearRetry(), []);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  const busy = run.kind === "running";

  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  const confirmWithS3 = useCallback(async (fileId: string, signal: AbortSignal): Promise<VaultFile | null> => {
    const started = Date.now();
    let delay = 1200;
    while (Date.now() - started < CONFIRM_TIMEOUT_MS) {
      if (signal.aborted) throw new DOMException("cancelled", "AbortError");
      const list = await filesResource.load();
      const record = list?.find((f) => f.fileId === fileId);
      if (record?.status === "ACTIVE") return record;
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 1.4, 4000);
    }
    return null;
  }, []);

  const start = useCallback(
    async (from: Phase = "link") => {
      if (!file) return;
      const controller = new AbortController();
      abortRef.current = controller;
      let phase: Phase = from;
      try {
        // 1 — one-time presigned link (reused for a retry while it is still fresh)
        const cached = ticketRef.current;
        if (from === "link" || !cached || Date.now() - cached.at > TICKET_REUSE_MS) {
          phase = "link";
          setRun({ kind: "running", phase });
          const ticket = await requestUploadUrl({ file, classification: level, uploadedBy: email, auditNote: note.trim() });
          ticketRef.current = { ticket, at: Date.now() };
          setAssignedId(ticket.fileId);
        }
        const { ticket } = ticketRef.current!;

        // 2 — PUT directly to the private bucket
        if (from !== "confirm") {
          phase = "transfer";
          setRun({ kind: "running", phase });
          setProgress({ loaded: 0, total: file.size, rate: 0 });
          const t0 = performance.now();
          await putToS3(
            ticket.uploadUrl,
            file,
            (loaded, total) => {
              const secs = (performance.now() - t0) / 1000;
              setProgress({ loaded, total, rate: secs > 0.2 ? loaded / secs : 0 });
            },
            controller.signal,
          );
        }

        // 3 — wait for the S3 ObjectCreated trigger to mark the record ACTIVE
        phase = "confirm";
        setRun({ kind: "running", phase });
        const record = await confirmWithS3(ticket.fileId, controller.signal);
        setRun(record ? { kind: "done", record } : { kind: "unconfirmed" });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setRun({ kind: "error", phase, message: "Upload cancelled. Nothing was confirmed by S3." });
          return;
        }
        const message = err instanceof Error ? err.message : "Something went wrong.";
        if (phase === "transfer" && err instanceof Error && "status" in err && err.status === 403) {
          ticketRef.current = null; // the link has expired — the next try asks for a new one
        }
        setRun({ kind: "error", phase, message });
      }
    },
    [file, level, email, note, confirmWithS3],
  );

  const reset = () => {
    setRetry(null);
    choose(null);
    setNote("");
    setLevel("Internal");
    setStage(1);
  };

  const ready = !!file && !fileError;
  const locked = stage === 3 && (run.kind === "running" || run.kind === "done" || run.kind === "unconfirmed");

  const pct = progress.total ? Math.round((progress.loaded / progress.total) * 100) : 0;

  return (
    <div
      className="min-h-full"
      onDragOver={(e) => {
        if (stage !== 1 || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={(e) => {
        if (stage !== 1) return;
        e.preventDefault();
        setDragging(false);
        const dropped = e.dataTransfer.files?.[0];
        if (dropped) choose(dropped);
      }}
    >
      <PageToolbar eyebrow="Checkpoint 01" title="Document check-in" subtitle="Present a document, declare its privacy level and transfer it to private storage" sticky={false} />

      <div className="mx-auto grid w-full max-w-[1180px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8 lg:py-8">
        <div className="min-w-0">
          {retry && run.kind !== "done" && (
            <Notice tone="info" icon={<RotateCw />} className="mb-5">
              <p>
                Re-checking <span className="font-medium text-foreground">{retry.fileName}</span>. S3 never confirmed the earlier attempt, so this creates a new,
                verified record with the same privacy level and note.
              </p>
              {file && file.name !== retry.fileName && (
                <p className="mt-1 text-warning">The chosen file is named “{file.name}”, not “{retry.fileName}”. Check it&apos;s the right document.</p>
              )}
            </Notice>
          )}
          <StageTrack stage={stage} done={run.kind === "done"} />

          <div className="mt-5 space-y-3">
            {/* ── Stage 1 ─────────────────────────────── */}
            <StagePanel
              n={1}
              title="Present document"
              state={stage === 1 ? "active" : "done"}
              summary={file ? `${file.name} · ${formatBytes(file.size)}` : undefined}
              onEdit={!locked && stage !== 1 ? () => setStage(1) : undefined}
            >
              <input
                ref={inputRef}
                type="file"
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                accept={ACCEPTED_EXTENSIONS.map((e) => `.${e}`).join(",")}
                onChange={(e) => {
                  const picked = e.target.files?.[0];
                  if (picked) choose(picked);
                  e.target.value = "";
                }}
              />
              {!file ? (
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className={cn(
                    "group relative flex w-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed px-6 py-12 text-center transition-[border-color,background-color] duration-[200ms] sm:py-14",
                    dragging ? "border-primary bg-primary/[0.07]" : "border-line-strong bg-tint/[0.015] hover:border-primary/50 hover:bg-primary/[0.035]",
                  )}
                >
                  {/* The intake slot */}
                  <span aria-hidden className={cn("absolute inset-x-10 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--color-primary),transparent)] transition-opacity", dragging ? "opacity-100" : "opacity-30 group-hover:opacity-70")} />
                  <span
                    className={cn(
                      "plate-raised mb-4 flex size-12 items-center justify-center rounded-2xl text-primary-hi transition-transform duration-[200ms]",
                      dragging ? "-translate-y-1 scale-105" : "group-hover:-translate-y-0.5",
                    )}
                  >
                    <ArrowUpFromLine className="size-5" />
                  </span>
                  <span className="text-[15px] font-medium text-foreground">{dragging ? "Release to check in" : "Drop a document at the intake"}</span>
                  <span className="mt-1 text-[13px] text-ink-3">
                    or <span className="font-medium text-primary-hi">browse this device</span>
                  </span>
                  <span className="mt-4 font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-3">PDF · Word · Excel · ZIP — up to 500 MB</span>
                </button>
              ) : (
                <div className="animate-rise">
                  <div className={cn("flex items-start gap-3.5 rounded-xl border p-3.5", fileError ? "border-danger/35 bg-danger/[0.05]" : "border-line bg-surface-2")}>
                    <FileGlyph name={file.name} contentType={file.type} size="lg" />
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-[14px] font-medium text-foreground">{file.name}</p>
                      <p className="mt-0.5 text-[12.5px] text-ink-3">
                        {kindLabel[fileKind(file.name, file.type)]} · {formatBytes(file.size)} · modified {formatFinderDate(new Date(file.lastModified).toISOString())}
                      </p>
                      <p className={cn("mt-2 flex items-center gap-1.5 text-[12.5px]", fileError ? "text-danger" : "text-success")} role={fileError ? "alert" : undefined}>
                        {fileError ? <CircleAlert className="size-3.5" /> : <CircleCheck className="size-3.5" />}
                        {fileError ?? "Passed intake checks: type and size accepted"}
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => inputRef.current?.click()}>
                      Change
                    </Button>
                  </div>
                  {previewUrl && (
                    <div className="mt-3 overflow-hidden rounded-xl border border-line bg-surface-2">
                      <p className="flex items-center gap-1.5 border-b border-line px-3 py-1.5 text-[11.5px] text-ink-3">
                        <ShieldCheck className="size-3.5" aria-hidden /> Local preview. Nothing has left your device yet.
                      </p>
                      <iframe src={`${previewUrl}#toolbar=0&view=FitH`} title={`Preview of ${file.name}`} loading="lazy" className="h-64 w-full bg-tint/[0.02]" />
                    </div>
                  )}
                  <div className="mt-4 flex justify-end">
                    <Button variant="primary" size="lg" disabled={!ready} onClick={() => setStage(2)}>
                      Continue to declaration
                    </Button>
                  </div>
                </div>
              )}
            </StagePanel>

            {/* ── Stage 2 ─────────────────────────────── */}
            <StagePanel
              n={2}
              title="Declare privacy"
              state={stage === 2 ? "active" : stage > 2 ? "done" : "locked"}
              summary={stage > 2 ? <ClassificationTag level={level} compact /> : undefined}
              onEdit={!locked && stage === 3 ? () => setStage(2) : undefined}
            >
              <PrivacyPicker value={level} onChange={setLevel} />
              {file && <PrivacyGuardian fileName={file.name} level={level} onApply={setLevel} />}
              <label className="mt-4 block">
                <span className="text-[12.5px] font-medium text-ink-2">
                  Note for the record <span className="font-normal text-ink-3">(optional)</span>
                </span>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={280}
                  placeholder="Why is this document being checked in?"
                  className="mt-1.5 h-10 w-full rounded-xl border border-line-strong bg-surface-1 px-3 text-[13px] outline-none transition-[border-color,box-shadow] duration-[160ms] hover:border-tint/25 focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-primary)_16%,transparent)] focus-visible:outline-none"
                />
                <span className="mt-1 flex justify-between text-[11.5px] text-ink-3">
                  <span>Stored with the document&apos;s record.</span>
                  <span className="tabular">{note.length}/280</span>
                </span>
              </label>
              <div className="mt-5 flex items-center justify-between gap-2">
                <Button variant="ghost" onClick={() => setStage(1)}>
                  Back
                </Button>
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() => {
                    setStage(3);
                    void start("link");
                  }}
                >
                  <ShieldCheck /> Check in securely
                </Button>
              </div>
            </StagePanel>

            {/* ── Stage 3 ─────────────────────────────── */}
            <StagePanel n={3} title="Secure transfer" state={stage === 3 ? "active" : "locked"}>
              {file && (
                <UploadProgress
                  file={file}
                  level={level}
                  run={run}
                  progress={progress}
                  onCancel={() => abortRef.current?.abort()}
                  onRetry={(p) => void start(p)}
                  onEdit={() => {
                    setRun({ kind: "idle" });
                    setStage(2);
                  }}
                  onReset={reset}
                />
              )}
            </StagePanel>
          </div>

          <p className="mt-6 flex items-start gap-2 text-[12px] leading-relaxed text-ink-3">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
            Files travel straight from your browser to a private S3 bucket over a short-lived signed link. A check-in only counts as complete when S3 itself reports the
            object.
          </p>
        </div>

        {/* ── Identity card ───────────────────────────── */}
        <aside className="max-lg:order-first lg:sticky lg:top-6 lg:self-start" aria-label="Document identity card">
          <IdentityCard file={file} fileError={fileError} level={level} assignedId={assignedId} run={run} pct={pct} />
        </aside>
      </div>
    </div>
  );
}

/* ── Identity card ─────────────────────────────────────────────────── */

function cardState(file: File | null, fileError: string | null, run: RunState, pct: number): { label: string; tone: Tone; pulse?: boolean } {
  if (!file) return { label: "Awaiting document", tone: "muted" };
  if (fileError) return { label: "Rejected at intake", tone: "danger" };
  switch (run.kind) {
    case "idle":
      return { label: "Validated · not yet sent", tone: "neutral" };
    case "running":
      return run.phase === "link"
        ? { label: "Requesting identity", tone: "info", pulse: true }
        : run.phase === "transfer"
          ? { label: `Transferring · ${pct}%`, tone: "info", pulse: true }
          : { label: "Awaiting S3 confirmation", tone: "info", pulse: true };
    case "error":
      return { label: run.phase === "link" ? "Link request failed" : run.phase === "transfer" ? "Transfer failed" : "Confirmation failed", tone: "danger" };
    case "unconfirmed":
      return { label: "Sent · S3 not confirmed yet", tone: "warning" };
    case "done":
      return { label: "Stored in private S3", tone: "success" };
  }
}

function IdentityCard({
  file,
  fileError,
  level,
  assignedId,
  run,
  pct,
}: {
  file: File | null;
  fileError: string | null;
  level: ClassificationLevel;
  assignedId: string | null;
  run: RunState;
  pct: number;
}) {
  const st = cardState(file, fileError, run, pct);
  const id = run.kind === "done" ? run.record.fileId : assignedId;
  return (
    <div className="plate-raised relative overflow-hidden rounded-[20px]">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-24" style={{ background: `radial-gradient(120% 100% at 0% 0%, ${alpha(classificationHex[level], file ? 14 : 0)}, transparent 70%)` }} />
      <div className="relative p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="eyebrow">Document identity</p>
          <StatusPill tone={st.tone} pulse={st.pulse}>
            {st.label}
          </StatusPill>
        </div>
        <div className="mt-4 flex items-start gap-3.5">
          {file ? (
            <FileGlyph name={file.name} contentType={file.type} size="lg" />
          ) : (
            <span aria-hidden className="flex h-12 w-10 shrink-0 items-center justify-center rounded-md border border-dashed border-line-strong text-ink-3">
              <FileCheck2 className="size-4" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className={cn("break-words text-[14px] font-medium leading-snug", file ? "text-foreground" : "text-ink-3")}>{file?.name ?? "No document presented"}</p>
            <p className="mt-0.5 text-[12px] text-ink-3">{file ? `${kindLabel[fileKind(file.name, file.type)]} · ${formatBytes(file.size)}` : "Drop or choose a file to begin"}</p>
          </div>
        </div>
        <dl className="mt-4 divide-y divide-line border-y border-line text-[12.5px]">
          <div className="flex items-center justify-between gap-3 py-2">
            <dt className="text-ink-3">Document ID</dt>
            <dd className="min-w-0 truncate font-mono text-[11.5px] text-ink-2" title={id ?? undefined}>
              {id ? shortId(id) : <span className="font-sans text-ink-3">Assigned at check-in</span>}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 py-2">
            <dt className="text-ink-3">Declared</dt>
            <dd>{file ? <ClassificationTag level={level} compact /> : <span className="text-ink-3">—</span>}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 py-2">
            <dt className="text-ink-3">Type</dt>
            <dd className="font-mono text-[11.5px] text-ink-2">{file ? file.type || "application/octet-stream" : "—"}</dd>
          </div>
        </dl>
        {run.kind === "running" && run.phase === "transfer" && (
          <div className="mt-3">
            <div className="h-1 overflow-hidden rounded-full bg-tint/[0.08]" aria-hidden>
              <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
        <p className="mt-3 text-[11.5px] leading-relaxed text-ink-3">
          The identifier is issued by the vault API with the upload link. It stays with the document through every later stage.
        </p>
      </div>
    </div>
  );
}

function StageTrack({ stage, done }: { stage: Stage; done: boolean }) {
  const labels = ["Present", "Declare", "Transfer"];
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label="Check-in steps">
      {labels.map((label, i) => {
        const n = (i + 1) as Stage;
        const complete = n < stage || (n === 3 && done);
        const current = n === stage && !complete;
        return (
          <li key={label} aria-current={current ? "step" : undefined}>
            <div className="h-[3px] overflow-hidden rounded-full bg-tint/[0.07]">
              <div
                className={cn(
                  "h-full rounded-full bg-primary transition-[width] duration-[320ms] ease-[var(--ease-out-soft)]",
                  complete ? "w-full" : current ? "w-1/2" : "w-0",
                )}
              />
            </div>
            <p className={cn("mt-2 font-mono text-[10.5px] uppercase tracking-[0.14em]", complete || current ? "text-ink-2" : "text-ink-3")}>
              <span className="tabular mr-1.5 text-ink-3">0{n}</span>
              {label}
              <span className="sr-only">{complete ? " (done)" : current ? " (current)" : ""}</span>
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function StagePanel({
  n,
  title,
  state,
  summary,
  onEdit,
  children,
}: {
  n: number;
  title: string;
  state: "active" | "done" | "locked";
  summary?: ReactNode;
  onEdit?: () => void;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={`Step ${n}: ${title}`}
      className={cn(
        "rounded-2xl transition-[background-color,border-color,opacity] duration-[200ms]",
        state === "active" ? "plate" : "border border-line bg-transparent",
        state === "locked" && "opacity-55",
      )}
    >
      <header className="flex min-h-12 items-center gap-3 px-4 py-2.5 sm:px-5">
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-semibold",
            state === "done" && "bg-primary text-primary-foreground",
            state === "active" && "border border-primary/60 text-primary-hi",
            state === "locked" && "border border-line-strong text-ink-3",
          )}
        >
          {state === "done" ? <Check className="size-3.5" strokeWidth={2.75} /> : n}
        </span>
        <h2 className={cn("text-[14px] font-semibold", state === "locked" ? "text-ink-3" : "text-foreground")}>{title}</h2>
        {state === "done" && summary && <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-3">{summary}</span>}
        {state === "done" && onEdit && (
          <button onClick={onEdit} className="ml-auto shrink-0 rounded-md px-1.5 text-[12.5px] font-medium text-primary-hi hover:text-foreground">
            Change
          </button>
        )}
      </header>
      {state === "active" && <div className="animate-rise px-4 pb-5 sm:px-5">{children}</div>}
    </section>
  );
}

function PrivacyPicker({ value, onChange }: { value: ClassificationLevel; onChange: (v: ClassificationLevel) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!delta) return;
    e.preventDefault();
    const next = (i + delta + classifications.length) % classifications.length;
    onChange(classifications[next]);
    refs.current[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-label="Privacy level" className="grid gap-2 sm:grid-cols-2">
      {classifications.map((c, i) => {
        const selected = c === value;
        const style = classificationStyle[c];
        const copy = classificationCopy[c];
        return (
          <button
            key={c}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(c)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "relative flex flex-col rounded-xl border p-3.5 text-left transition-[border-color,background-color,box-shadow] duration-[180ms]",
              selected ? "bg-tint/[0.04]" : "border-line hover:border-line-strong hover:bg-tint/[0.02]",
            )}
            style={selected ? { borderColor: alpha(classificationHex[c], 60), boxShadow: `0 0 0 3px ${alpha(classificationHex[c], 14)}` } : undefined}
          >
            <span className="flex items-center gap-2.5">
              <span className={cn("flex h-7 items-center gap-1.5 rounded-lg border px-2", style.bg, style.ring, style.text)}>
                <TierMark level={c} />
              </span>
              <span className="text-[14px] font-semibold text-foreground">{c}</span>
              <span
                className={cn("ml-auto flex size-4 items-center justify-center rounded-full border transition-colors", selected ? "border-transparent bg-primary" : "border-line-strong")}
                aria-hidden
              >
                {selected && <Check className="size-2.5 text-primary-foreground" strokeWidth={3} />}
              </span>
            </span>
            <span className="mt-2 text-[13px] text-ink-2">{copy.summary}</span>
            <span className="mt-0.5 text-[12px] leading-snug text-ink-3">{copy.detail}</span>
            <span className="mt-2 text-[11.5px] text-ink-3">
              <span className="text-ink-2">e.g.</span> {copy.examples}
            </span>
          </button>
        );
      })}
      <p className="text-[11.5px] leading-relaxed text-ink-3 sm:col-span-2">
        The declared level travels with the document and appears on its passport. Who may open it is decided by the vault&apos;s server rules.
      </p>
    </div>
  );
}

function UploadProgress({
  file,
  level,
  run,
  progress,
  onCancel,
  onRetry,
  onEdit,
  onReset,
}: {
  file: File;
  level: ClassificationLevel;
  run: RunState;
  progress: { loaded: number; total: number; rate: number };
  onCancel: () => void;
  onRetry: (from: Phase) => void;
  onEdit: () => void;
  onReset: () => void;
}) {
  const order: Phase[] = ["link", "transfer", "confirm"];
  const phaseIndex = run.kind === "running" || run.kind === "error" ? order.indexOf(run.phase) : run.kind === "idle" ? -1 : 3;
  const pct = progress.total ? Math.round((progress.loaded / progress.total) * 100) : 0;

  const stepState = (i: number): "pending" | "active" | "done" | "error" | "waiting" => {
    if (run.kind === "unconfirmed") return i < 2 ? "done" : "waiting";
    if (i < phaseIndex) return "done";
    if (i === phaseIndex) return run.kind === "error" ? "error" : "active";
    return "pending";
  };

  if (run.kind === "done") return <CheckedIn file={file} record={run.record} level={level} onReset={onReset} />;

  return (
    <div>
      <ol className="space-y-3.5" aria-live="polite">
        <Step state={stepState(0)} title="Request a one-time upload link" detail="Issued by the vault API for this file only. The document ID is assigned here." />
        <Step
          state={stepState(1)}
          title="Transfer to private S3"
          detail={
            stepState(1) === "active" || stepState(1) === "done" ? (
              <span className="tabular">
                {formatBytes(progress.loaded)} of {formatBytes(progress.total || file.size)}
                {stepState(1) === "active" && progress.rate > 0 && ` · ${formatBytes(progress.rate)}/s`}
              </span>
            ) : (
              "Your browser sends the file directly to the bucket."
            )
          }
        >
          {(stepState(1) === "active" || stepState(1) === "done") && (
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-tint/[0.07]"
              role="progressbar"
              aria-label="Transfer progress"
              aria-valuenow={stepState(1) === "done" ? 100 : pct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={cn("h-full rounded-full transition-[width] duration-[200ms]", stepState(1) === "done" ? "bg-success" : "bg-primary")}
                style={{ width: `${stepState(1) === "done" ? 100 : pct}%` }}
              />
            </div>
          )}
        </Step>
        <Step
          state={stepState(2)}
          title="S3 confirms receipt"
          detail={
            stepState(2) === "active"
              ? "Waiting for S3 to report the stored object…"
              : stepState(2) === "waiting"
                ? "No confirmation yet."
                : "The record turns active when S3 reports the object."
          }
        />
      </ol>

      {run.kind === "running" && (run.phase === "link" || run.phase === "transfer") && (
        <div className="mt-5 flex justify-end">
          <Button variant="ghost" onClick={onCancel}>
            <X /> Cancel transfer
          </Button>
        </div>
      )}

      {run.kind === "error" && (
        <Notice tone="danger" icon={<CircleAlert />} className="mt-5">
          <p>{run.message}</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={() => onRetry(run.phase)}>
              <RotateCw /> Retry {run.phase === "link" ? "link request" : run.phase === "transfer" ? "transfer" : "confirmation"}
            </Button>
            <Button size="sm" variant="ghost" onClick={onEdit}>
              Change details
            </Button>
          </div>
        </Notice>
      )}

      {run.kind === "unconfirmed" && (
        <Notice tone="warning" icon={<Clock />} className="mt-5">
          <p>
            S3 accepted the transfer but hasn&apos;t confirmed the object to the vault yet. Until it does, the document shows as{" "}
            <span className="text-foreground">Awaiting S3</span> on the lane.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={() => onRetry("confirm")}>
              <RotateCw /> Check again
            </Button>
            <Link href="/dashboard" className="inline-flex h-7 items-center px-2 text-[12.5px] font-medium text-primary-hi hover:text-foreground">
              Open the lane
            </Link>
          </div>
        </Notice>
      )}
    </div>
  );
}

/** After S3 confirms: the clearance moment, then the document's live inspection lane and evidence. */
function CheckedIn({ file, record, level, onReset }: { file: File; record: VaultFile; level: ClassificationLevel; onReset: () => void }) {
  const { role } = useSession();
  const { state: security } = useSecurity(record.fileId, record.s3Key);
  const scan = useScan(record.fileId, record.s3Key);
  const stages = inspectionLane({ file: record, security, scan });
  const sizeMatches = record.objectSize === file.size;
  const lvl = record.classification ?? level;

  return (
    <div className="animate-rise">
      <div className="flex flex-col items-center text-center">
        <SealMoment file={file} color={classificationHex[lvl]} />
        <p className="text-[17px] font-semibold tracking-[-0.01em] text-foreground">Checked in and stored</p>
        <p className="mx-auto mt-1 max-w-sm text-[13px] text-ink-3">
          S3 confirmed <span className="text-ink-2">{record.fileName}</span> at <time dateTime={record.uploadedAt}>{formatFull(record.uploadedAt)}</time>.
        </p>
      </div>

      <dl className="mx-auto mt-5 max-w-md divide-y divide-line rounded-xl border border-line bg-surface-2 px-3.5 text-[12.5px]">
        <Row label="Privacy">
          <ClassificationTag level={lvl} compact />
        </Row>
        <Row label="Size check">
          {record.objectSize === undefined ? (
            <span className="text-ink-3">Not reported by S3</span>
          ) : sizeMatches ? (
            <span className="text-success">{record.objectSize.toLocaleString()} bytes, matches your file</span>
          ) : (
            <span className="text-warning">
              S3 reports {record.objectSize.toLocaleString()} bytes; your file is {file.size.toLocaleString()}
            </span>
          )}
        </Row>
        <Row label="Document ID">
          <span className="break-all font-mono text-[11.5px] text-ink-2">{record.fileId}</span>
        </Row>
      </dl>

      <div className="mt-6 rounded-2xl border border-line bg-surface-2/60 p-4">
        <p className="eyebrow mb-3">Inspection lane</p>
        <InspectionLane stages={stages} layout="vertical" />
      </div>

      <div className="mt-4">
        <p className="eyebrow mb-2">Inspection evidence</p>
        <InspectionEvidence file={record} canEdit role={role} autoScan={isPdf(record)} />
      </div>

      <div className="mt-5 flex flex-col-reverse justify-center gap-2 sm:flex-row">
        <Button onClick={onReset}>Check in another</Button>
        <ButtonLink href={`/files?doc=${encodeURIComponent(record.fileId)}`} variant="primary">
          Open passport
        </ButtonLink>
      </div>
    </div>
  );
}

/** The confirmation moment: a ring draws around the document in its privacy colour, then the mark lands. Shown only after S3 confirms. */
function SealMoment({ file, color }: { file: File; color: string }) {
  return (
    <div className="relative mx-auto mb-4 mt-1 size-[128px]" aria-hidden>
      <div className="absolute inset-0 rounded-full" style={{ background: `radial-gradient(closest-side, ${alpha(color, 18)}, transparent)` }} />
      <svg viewBox="0 0 132 132" className="absolute inset-0 -rotate-90">
        <circle cx="66" cy="66" r="54" fill="none" stroke="var(--color-tint)" strokeOpacity="0.08" strokeWidth="2" />
        <circle cx="66" cy="66" r="54" fill="none" stroke={color} strokeWidth="2.25" strokeLinecap="round" strokeDasharray="340" className="animate-draw" style={{ ["--len" as string]: 340 }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <FileGlyph name={file.name} contentType={file.type} size="xl" />
      </div>
      <span className="absolute bottom-3 right-3 flex size-8 animate-seal items-center justify-center rounded-full border-2 border-background text-primary-foreground" style={{ background: color }}>
        <Check className="size-4" strokeWidth={3} />
      </span>
    </div>
  );
}

function Step({
  state,
  title,
  detail,
  children,
}: {
  state: "pending" | "active" | "done" | "error" | "waiting";
  title: string;
  detail: ReactNode;
  children?: ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
          state === "done" && "bg-success/15 text-success",
          state === "active" && "text-primary-hi",
          state === "error" && "bg-danger/15 text-danger",
          state === "waiting" && "bg-warning/15 text-warning",
          state === "pending" && "border border-line-strong",
        )}
        aria-hidden
      >
        {state === "done" && <Check className="size-3" strokeWidth={3} />}
        {state === "active" && <Loader2 className="size-4 animate-spin" />}
        {state === "error" && <X className="size-3" strokeWidth={3} />}
        {state === "waiting" && <Clock className="size-3" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("text-[13.5px] font-medium", state === "pending" ? "text-ink-3" : "text-foreground")}>
          <span className="sr-only">{state}: </span>
          {title}
        </p>
        <p className="text-[12.5px] text-ink-3">{detail}</p>
        {children}
      </div>
    </li>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <dt className="shrink-0 text-ink-3">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}

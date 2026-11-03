"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowUpFromLine,
  Check,
  CircleAlert,
  CircleCheck,
  Clock,
  Loader2,
  RotateCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/session";
import { filesResource } from "@/lib/store";
import { putToS3, requestUploadUrl, type UploadTicket } from "@/lib/api";
import { formatBytes, formatFinderDate, formatFull } from "@/lib/format";
import { clearRetry, peekRetry, takeHandedOffFile } from "@/lib/handoff";
import { PrivacyGuardian } from "@/components/upload/PrivacyGuardian";
import { PrivacyReview } from "@/components/vault/PrivacyReview";
import {
  ACCEPTED_EXTENSIONS,
  classificationCopy,
  classifications,
  fileKind,
  kindLabel,
  validateUpload,
} from "@/lib/vault";
import type { ClassificationLevel, VaultFile } from "@/lib/types";
import { PageToolbar } from "@/components/shell/PageToolbar";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Notice } from "@/components/ui/primitives";
import { ClassificationTag, FileGlyph, classificationHex, classificationStyle } from "@/components/vault/tags";

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

  const ticketRef = useRef<{ ticket: UploadTicket; at: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const previewRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const handoffChecked = useRef(false);

  const choose = useCallback((next: File | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
    ticketRef.current = null;
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

  // A file dropped on the Workspace arrives here; pick it up once.
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
      <PageToolbar title="Upload Studio" subtitle="Add a document to the private vault" sticky={false} />

      <div className="mx-auto w-full max-w-[680px] px-4 py-5 sm:px-6 sm:py-8">
        {retry && run.kind !== "done" && (
          <Notice tone="info" icon={<RotateCw />} className="mb-5">
            <p>
              Re-uploading <span className="font-medium text-foreground">{retry.fileName}</span>. S3 never confirmed the earlier attempt, so
              this creates a new, verified record with the same privacy level and note.
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
            title="Choose file"
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
                  "group flex w-full flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center transition-[border-color,background-color] duration-[200ms]",
                  dragging ? "border-primary bg-primary/[0.08]" : "border-line-strong bg-white/[0.015] hover:border-primary/50 hover:bg-primary/[0.04]",
                )}
              >
                <span
                  className={cn(
                    "mb-4 flex size-12 items-center justify-center rounded-2xl border border-line-strong bg-surface-3 text-primary-hi transition-transform duration-[200ms]",
                    dragging ? "-translate-y-1 scale-105" : "group-hover:-translate-y-0.5",
                  )}
                >
                  <ArrowUpFromLine className="size-5" />
                </span>
                <span className="text-[15px] font-medium text-foreground">{dragging ? "Release to add" : "Drop a document here"}</span>
                <span className="mt-1 text-[13px] text-ink-3">
                  or <span className="text-primary-hi">choose from your device</span>
                </span>
                <span className="mt-4 text-[12px] text-ink-3">PDF, Word, Excel or ZIP · up to 500 MB</span>
              </button>
            ) : (
              <div className="animate-rise">
                <div className="flex items-start gap-3.5 rounded-xl border border-line bg-surface-2 p-3.5">
                  <FileGlyph name={file.name} contentType={file.type} size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-[14px] font-medium text-foreground">{file.name}</p>
                    <p className="mt-0.5 text-[12.5px] text-ink-3">
                      {kindLabel[fileKind(file.name, file.type)]} · {formatBytes(file.size)} · modified{" "}
                      {formatFinderDate(new Date(file.lastModified).toISOString())}
                    </p>
                    <p className={cn("mt-2 flex items-center gap-1.5 text-[12.5px]", fileError ? "text-danger" : "text-success")}>
                      {fileError ? <CircleAlert className="size-3.5" /> : <CircleCheck className="size-3.5" />}
                      {fileError ?? "Ready to upload"}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => inputRef.current?.click()}>
                    Replace
                  </Button>
                </div>
                {previewUrl && (
                  <div className="mt-3 overflow-hidden rounded-xl border border-line bg-surface-2">
                    <p className="border-b border-line px-3 py-1.5 text-[11.5px] text-ink-3">
                      Local preview — nothing has left your device yet
                    </p>
                    <iframe src={`${previewUrl}#toolbar=0&view=FitH`} title={`Preview of ${file.name}`} className="h-64 w-full bg-white/[0.02]" />
                  </div>
                )}
                <div className="mt-4 flex justify-end">
                  <Button variant="primary" size="lg" disabled={!ready} onClick={() => setStage(2)}>
                    Continue
                  </Button>
                </div>
              </div>
            )}
          </StagePanel>

          {/* ── Stage 2 ─────────────────────────────── */}
          <StagePanel
            n={2}
            title="Set privacy"
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
                placeholder="Why is this being uploaded?"
                className="mt-1.5 h-9 w-full rounded-lg border border-line bg-white/[0.03] px-3 text-[13px] outline-none transition-[border-color,box-shadow] duration-[160ms] hover:border-line-strong focus:border-primary/50 focus:shadow-[0_0_0_3px_rgba(52,121,237,0.18)] focus-visible:outline-none"
              />
              <span className="mt-1 block text-[11.5px] text-ink-3">Stored with the document&apos;s metadata.</span>
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
                <ShieldCheck /> Upload securely
              </Button>
            </div>
          </StagePanel>

          {/* ── Stage 3 ─────────────────────────────── */}
          <StagePanel n={3} title="Secure upload" state={stage === 3 ? "active" : "locked"}>
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
          Files go straight from your browser to a private S3 bucket using a short-lived signed link. SecureVault only marks an upload
          complete once S3 itself reports the object.
        </p>
      </div>
    </div>
  );
}

function StageTrack({ stage, done }: { stage: Stage; done: boolean }) {
  const labels = ["Choose file", "Set privacy", "Secure upload"];
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label="Upload progress">
      {labels.map((label, i) => {
        const n = (i + 1) as Stage;
        const complete = n < stage || (n === 3 && done);
        const current = n === stage && !complete;
        return (
          <li key={label} aria-current={current ? "step" : undefined}>
            <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className={cn(
                  "h-full rounded-full bg-primary transition-[width] duration-[220ms] ease-[var(--ease-out-soft)]",
                  complete ? "w-full" : current ? "w-1/2" : "w-0",
                )}
              />
            </div>
            <p className={cn("mt-2 text-[12px] font-medium", complete || current ? "text-ink-2" : "text-ink-3")}>
              <span className="tabular mr-1 text-ink-3">{n}</span>
              {label}
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
        "rounded-2xl border transition-[background-color,border-color,opacity] duration-[200ms]",
        state === "active" ? "border-line-strong bg-surface-1 hairline-top" : "border-line bg-transparent",
        state === "locked" && "opacity-50",
      )}
    >
      <header className="flex min-h-12 items-center gap-3 px-4 py-2.5 sm:px-5">
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold",
            state === "done" && "bg-primary text-white",
            state === "active" && "border border-primary/60 text-primary-hi",
            state === "locked" && "border border-line-strong text-ink-3",
          )}
        >
          {state === "done" ? <Check className="size-3.5" strokeWidth={2.5} /> : n}
        </span>
        <h2 className={cn("text-[14px] font-semibold", state === "locked" ? "text-ink-3" : "text-foreground")}>{title}</h2>
        {state === "done" && summary && <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-3">{summary}</span>}
        {state === "done" && onEdit && (
          <button onClick={onEdit} className="ml-auto shrink-0 rounded-md px-1.5 text-[12.5px] font-medium text-primary-hi hover:text-white">
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
        const Icon = style.icon;
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
              selected ? "bg-white/[0.04]" : "border-line hover:border-line-strong hover:bg-white/[0.02]",
            )}
            style={
              selected
                ? { borderColor: `${classificationHex[c]}80`, boxShadow: `0 0 0 3px ${classificationHex[c]}1f` }
                : undefined
            }
          >
            <span className="flex items-center gap-2.5">
              <span className={cn("flex size-7 items-center justify-center rounded-lg border", style.bg, style.ring, style.text)}>
                <Icon className="size-3.5" />
              </span>
              <span className="text-[14px] font-semibold text-foreground">{c}</span>
              <span
                className={cn(
                  "ml-auto flex size-4 items-center justify-center rounded-full border transition-colors",
                  selected ? "border-transparent bg-primary" : "border-line-strong",
                )}
                aria-hidden
              >
                {selected && <Check className="size-2.5 text-white" strokeWidth={3} />}
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
        The label is stored with the document and shown in its passport. Who may open it is decided by the vault&apos;s server rules.
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
  const phaseIndex =
    run.kind === "running" || run.kind === "error" ? order.indexOf(run.phase) : run.kind === "idle" ? -1 : 3;
  const pct = progress.total ? Math.round((progress.loaded / progress.total) * 100) : 0;

  const stepState = (i: number): "pending" | "active" | "done" | "error" | "waiting" => {
    if (run.kind === "unconfirmed") return i < 2 ? "done" : "waiting";
    if (i < phaseIndex) return "done";
    if (i === phaseIndex) return run.kind === "error" ? "error" : "active";
    return "pending";
  };

  if (run.kind === "done") {
    const sizeMatches = run.record.objectSize === file.size;
    return (
      <div className="animate-rise text-center">
        <SealMoment file={file} color={classificationHex[run.record.classification ?? level]} />
        <p className="text-[16px] font-semibold text-foreground">Stored in the vault</p>
        <p className="mx-auto mt-1 max-w-sm text-[13px] text-ink-3">
          S3 confirmed <span className="text-ink-2">{run.record.fileName}</span> at{" "}
          <time dateTime={run.record.uploadedAt}>{formatFull(run.record.uploadedAt)}</time>.
        </p>
        <div className="mx-auto mt-4 flex max-w-sm flex-col gap-1.5 rounded-xl border border-line bg-surface-2 p-3 text-left text-[12.5px]">
          <Row label="Privacy">
            <ClassificationTag level={run.record.classification ?? level} compact />
          </Row>
          <Row label="Size check">
            {run.record.objectSize === undefined ? (
              <span className="text-ink-3">Not reported by S3</span>
            ) : sizeMatches ? (
              <span className="text-success">{run.record.objectSize.toLocaleString()} bytes — matches your file</span>
            ) : (
              <span className="text-warning">
                S3 reports {run.record.objectSize.toLocaleString()} bytes; your file is {file.size.toLocaleString()}
              </span>
            )}
          </Row>
          <Row label="File ID">
            <span className="break-all font-mono text-[11.5px] text-ink-2">{run.record.fileId}</span>
          </Row>
        </div>
        <div className="mx-auto mt-4 max-w-sm rounded-xl border border-line bg-surface-2 p-3 text-left">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Privacy Guardian</p>
          <PrivacyReview
            fileId={run.record.fileId}
            classification={run.record.classification ?? level}
            autoScan={/\.pdf$/i.test(run.record.fileName)}
            uploadedAt={run.record.uploadedAt}
            canEdit
          />
        </div>
        <div className="mt-5 flex flex-col-reverse justify-center gap-2 sm:flex-row">
          <Button onClick={onReset}>Upload another</Button>
          <ButtonLink href={`/files?doc=${encodeURIComponent(run.record.fileId)}`} variant="primary">
            Open passport
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-3">
        <FileGlyph name={file.name} contentType={file.type} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] text-foreground">{file.name}</p>
          <p className="text-[12px] text-ink-3">{formatBytes(file.size)}</p>
        </div>
        <ClassificationTag level={level} compact />
      </div>

      <ol className="space-y-3" aria-live="polite">
        <Step state={stepState(0)} title="Request a one-time upload link" detail="Issued by the vault API for this file only." />
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
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"
              role="progressbar"
              aria-label="Transfer progress"
              aria-valuenow={pct}
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
                : "The vault record turns active when S3 reports the object."
          }
        />
      </ol>

      {run.kind === "running" && (run.phase === "link" || run.phase === "transfer") && (
        <div className="mt-5 flex justify-end">
          <Button variant="ghost" onClick={onCancel}>
            <X /> Cancel
          </Button>
        </div>
      )}

      {run.kind === "error" && (
        <Notice tone="danger" icon={<CircleAlert />} className="mt-5">
          <p>{run.message}</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={() => onRetry(run.phase)}>
              <RotateCw /> Try again
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
            S3 accepted the transfer, but hasn&apos;t confirmed the object to the vault yet. Until it does, the document shows as{" "}
            <span className="text-foreground">Awaiting S3</span> in Explorer.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={() => onRetry("confirm")}>
              <RotateCw /> Check again
            </Button>
            <Link href="/files" className="inline-flex h-7 items-center px-2 text-[12.5px] font-medium text-primary-hi hover:text-white">
              Open Explorer
            </Link>
          </div>
        </Notice>
      )}
    </div>
  );
}

/** The confirmation moment: a ring draws around the document in its privacy colour, then the seal lands. */
function SealMoment({ file, color }: { file: File; color: string }) {
  return (
    <div className="relative mx-auto mb-4 mt-1 size-[132px]" aria-hidden>
      <div className="absolute inset-0 rounded-full" style={{ background: `radial-gradient(closest-side, ${color}33, transparent)` }} />
      <svg viewBox="0 0 132 132" className="absolute inset-0 -rotate-90">
        <circle cx="66" cy="66" r="54" fill="none" stroke="white" strokeOpacity="0.06" strokeWidth="2" />
        <circle
          cx="66"
          cy="66"
          r="54"
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="340"
          className="animate-draw"
          style={{ ["--len" as string]: 340, filter: `drop-shadow(0 0 6px ${color})` }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <FileGlyph name={file.name} contentType={file.type} size="xl" className="drop-shadow-[0_10px_18px_rgba(0,0,0,0.6)]" />
      </div>
      <span
        className="absolute bottom-3 right-3 flex size-8 animate-seal items-center justify-center rounded-full border-2 border-background text-white"
        style={{ background: color, boxShadow: `0 0 18px ${color}` }}
      >
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
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-ink-3">{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
}

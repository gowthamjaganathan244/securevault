"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { CircleAlert, FolderOpen, Loader2, Plus, RotateCw, Search, SearchX, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { integrations, pendingEndpoints } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useAudit, useFiles } from "@/lib/store";
import { formatBytes, formatFinderDate, formatFull } from "@/lib/format";
import { canDownload, canManage, classifications, fileExtension, fileKind, isDenied, kindLabel, needsAttention, uploadState, uploadStateCopy } from "@/lib/vault";
import { useMediaQuery } from "@/lib/useMediaQuery";
import type { ClassificationLevel, VaultFile } from "@/lib/types";
import { PendingBadge } from "@/components/ui/Dialog";
import { Notice } from "@/components/ui/primitives";
import { ActionsMenu } from "@/components/vault/ActionsMenu";
import { useDocumentActions } from "@/components/vault/DocumentActions";
import { useDownload } from "@/components/vault/useDownload";
import { classificationHex } from "@/components/vault/tags";

/* Classification colours come from the shared design system (approved Explorer palette). */
const LEVEL = classificationHex;

type Level = "All" | ClassificationLevel;
type ViewMode = "gallery" | "list";

const dateOf = (f: VaultFile) => Date.parse(f.uploadedAt || f.createdAt || "") || 0;
const typeLabel = (f: VaultFile) => (fileExtension(f.fileName) || "file").toUpperCase().slice(0, 4);

function Glyph({ file, className }: { file: VaultFile; className?: string }) {
  return (
    <div className={cn("sv-glyph", className)} data-kind={fileKind(file.fileName, file.contentType)} aria-hidden>
      <span>{typeLabel(file)}</span>
    </div>
  );
}

function statusColor(file: VaultFile) {
  const s = uploadState(file);
  return s === "stored" ? "#62d1a4" : s === "awaiting" ? "#8bb9ff" : "#edc06a";
}

export function ExplorerView() {
  const { email } = useSession();
  const { files, loading, error, refresh, refreshing } = useFiles();
  const { events } = useAudit();
  const searchParams = useSearchParams();
  const selectedParam = searchParams.get("doc");

  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<Level>("All");
  const [mineOnly, setMineOnly] = useState(false);
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [showIncomplete, setShowIncomplete] = useState(false);
  // Gallery is the startup view on every load; List is a per-visit toggle only.
  const [view, setView] = useState<ViewMode>("gallery");
  const searchRef = useRef<HTMLInputElement>(null);
  const passportRef = useRef<HTMLElement>(null);
  const stacked = useMediaQuery("(max-width: 819px)", false);

  const deniedIds = useMemo(() => new Set(events.filter(isDenied).map((e) => e.fileId ?? "")), [events]);
  const incompleteCount = useMemo(() => files.filter((f) => uploadState(f) === "not-received").length, [files]);

  const visible = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return files
      .filter((f) => {
        if (attentionOnly && !needsAttention(f, deniedIds)) return false;
        if (!attentionOnly && !showIncomplete && uploadState(f) === "not-received" && f.fileId !== selectedParam) return false;
        if (level !== "All" && f.classification !== level) return false;
        if (mineOnly && f.uploadedBy !== email) return false;
        if (terms.length) {
          const hay = `${f.fileName} ${f.uploadedBy ?? ""} ${f.classification} ${f.auditNote ?? ""} ${f.contentType ?? ""}`.toLowerCase();
          if (!terms.every((t) => hay.includes(t))) return false;
        }
        return true;
      })
      .sort((a, b) => dateOf(b) - dateOf(a));
  }, [files, query, level, mineOnly, attentionOnly, showIncomplete, deniedIds, email, selectedParam]);

  // As in the reference, the passport always shows a document: the chosen one, else the first visible.
  const selected = useMemo(
    () => files.find((f) => f.fileId === selectedParam) ?? visible[0] ?? null,
    [files, selectedParam, visible],
  );

  const select = useCallback(
    (id: string) => {
      window.history.replaceState(null, "", `/files?doc=${encodeURIComponent(id)}`);
      if (stacked) requestAnimationFrame(() => passportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    },
    [stacked],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !(e.target as HTMLElement).closest("input, textarea, [contenteditable]")) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filtersActive = !!query || level !== "All" || mineOnly || attentionOnly;
  const clearFilters = () => {
    setQuery("");
    setLevel("All");
    setMineOnly(false);
    setAttentionOnly(false);
  };

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto w-full max-w-[1550px] px-3 pb-10 pt-2 sm:px-[22px]">
        {/* Heading */}
        <section className="mb-[23px] mt-3 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="mb-1 text-[11px] font-bold tracking-[1.5px] text-ink-3">YOUR DOCUMENTS</p>
            <h1 className="text-[28px] font-[680] leading-[1.13] tracking-[-1.35px] text-foreground md:text-[35px]">Your vault.</h1>
            <p className="mt-2 text-[13px] text-ink-3">Everything important, beautifully organised and protected.</p>
          </div>
          <Link
            href="/upload"
            className="flex shrink-0 items-center gap-[7px] rounded-[11px] border border-[#5a91f5] bg-primary px-[18px] py-[11px] text-[14px] font-[630] text-white transition-colors duration-150 hover:bg-[#4386f7]"
          >
            <Plus className="size-4" aria-hidden /> New file
          </Link>
        </section>

        {/* Search + privacy chips */}
        <section className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
          <label className="flex h-[42px] min-w-full flex-1 items-center gap-2.5 rounded-[11px] border border-line bg-surface-1 px-3.5 text-ink-3 sm:min-w-[255px] sm:max-w-[440px]">
            <Search className="size-[18px] shrink-0" aria-hidden />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a document, person or classification"
              aria-label="Search documents"
              className="w-full bg-transparent text-[13px] text-foreground outline-none placeholder:text-ink-3 focus-visible:outline-none"
            />
          </label>
          <div className="flex w-full flex-wrap items-center gap-[5px] md:w-auto" role="group" aria-label="Privacy level">
            {(["All", ...classifications] as Level[]).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={level === f}
                onClick={() => setLevel(f)}
                className={cn(
                  "flex items-center gap-1.5 rounded-[10px] border px-3 py-[9px] text-[12px] transition-colors duration-150",
                  level === f ? "border-[#38537a] bg-select-strong text-white" : "border-transparent text-ink-2 hover:bg-surface-3",
                )}
              >
                {f !== "All" && <i className="inline-block size-[7px] rounded-full" style={{ background: LEVEL[f] }} aria-hidden />}
                {f}
              </button>
            ))}
          </div>
        </section>

        {/* Toggles + view switch */}
        <section className="mb-4 mt-[3px] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-[9px]">
            <Control pressed={mineOnly} onClick={() => setMineOnly((m) => !m)}>
              Mine
            </Control>
            <Control pressed={attentionOnly} onClick={() => setAttentionOnly((a) => !a)} title="Uploads S3 hasn't confirmed, and documents with denied access attempts">
              Needs attention
            </Control>
            {incompleteCount > 0 && (
              <Control pressed={showIncomplete} onClick={() => setShowIncomplete((s) => !s)} title="Records where an upload link was issued but S3 never confirmed a file">
                Show incomplete ({incompleteCount})
              </Control>
            )}
            <span className="text-[12px] text-ink-3" aria-live="polite">
              {loading ? "Loading…" : `${visible.length} document${visible.length === 1 ? "" : "s"}`}
            </span>
            <button
              type="button"
              onClick={() => refresh()}
              disabled={refreshing}
              aria-label="Refresh"
              title="Refresh"
              className="rounded-lg p-1.5 text-ink-3 transition-colors hover:bg-surface-3 hover:text-white"
            >
              <RotateCw className={cn("size-3.5", refreshing && "animate-spin")} />
            </button>
          </div>
          <div className="flex gap-[3px] whitespace-nowrap rounded-[11px] border border-line-strong bg-surface-3 p-[3px]" role="group" aria-label="Document view">
            {(["gallery", "list"] as ViewMode[]).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={cn("rounded-lg px-[11px] py-[7px] text-[12px]", view === v ? "bg-select-strong text-white" : "text-ink-2")}
              >
                {v === "gallery" ? "Gallery" : "List"}
              </button>
            ))}
          </div>
        </section>

        {/* Canvas: documents + passport */}
        <main className="grid items-start gap-[18px] min-[820px]:grid-cols-[minmax(0,1fr)_290px] min-[1160px]:grid-cols-[minmax(0,1fr)_332px]">
          <section aria-label="Documents" className="min-w-0">
            {error && files.length === 0 ? (
              <Notice tone="danger" icon={<CircleAlert />}>
                {error} Check your connection and{" "}
                <button className="underline" onClick={() => refresh()}>
                  try again
                </button>
                .
              </Notice>
            ) : loading ? (
              <div className="grid grid-cols-2 gap-2 min-[431px]:gap-3.5 min-[1160px]:grid-cols-3" aria-busy="true" aria-label="Loading documents">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-[214px] animate-pulse rounded-[17px] border border-line bg-surface-1" />
                ))}
              </div>
            ) : visible.length === 0 ? (
              <Empty
                icon={files.length === 0 ? <FolderOpen /> : <SearchX />}
                text={files.length === 0 ? "The vault is empty. Upload a document to begin." : "No documents match these filters."}
                action={filtersActive ? { label: "Clear filters", onClick: clearFilters } : undefined}
              />
            ) : view === "gallery" ? (
              <ul className="grid grid-cols-2 gap-2 min-[431px]:gap-3.5 min-[1160px]:grid-cols-3">
                {visible.map((f) => (
                  <li key={f.fileId} className="min-w-0">
                    <FileCard file={f} selected={f.fileId === selected?.fileId} onSelect={() => select(f.fileId)} />
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="flex flex-col gap-[5px]">
                {visible.map((f) => (
                  <li key={f.fileId}>
                    <FileRow file={f} selected={f.fileId === selected?.fileId} onSelect={() => select(f.fileId)} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <aside
            ref={passportRef}
            aria-label="Document Passport"
            className="scroll-mt-3 rounded-[19px] border border-line-strong bg-surface-2 p-[15px] min-[431px]:p-[19px] min-[820px]:sticky min-[820px]:top-3.5 min-[820px]:min-h-[510px]"
          >
            {selected ? <Passport key={selected.fileId} file={selected} /> : <p className="py-10 text-center text-[13px] text-ink-3">Select a document to see its passport.</p>}
          </aside>
        </main>
      </div>
    </div>
  );
}

function Control({ pressed, onClick, title, children }: { pressed: boolean; onClick: () => void; title?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      title={title}
      className={cn(
        "rounded-[9px] border px-3 py-2 text-[12px] transition-colors duration-150",
        pressed ? "border-[#426da6] bg-select-strong text-foreground" : "border-line-strong bg-surface-1 text-ink-2 hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

function Empty({ icon, text, action }: { icon: ReactNode; text: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="flex flex-col items-center rounded-[14px] border border-dashed border-line px-5 py-[60px] text-center text-ink-3 [&>svg]:mb-3 [&>svg]:size-6">
      {icon}
      <p className="text-[13px]">{text}</p>
      {action && (
        <button type="button" onClick={action.onClick} className="mt-3 text-[12.5px] font-medium text-primary-hi hover:text-white">
          {action.label}
        </button>
      )}
    </div>
  );
}

function FileCard({ file, selected, onSelect }: { file: VaultFile; selected: boolean; onSelect: () => void }) {
  const state = uploadState(file);
  return (
    <div
      className={cn(
        "group relative flex min-w-0 flex-col rounded-[17px] border transition-[border-color,background-color,transform] duration-150",
        selected
          ? "border-[#5b96ed] bg-select shadow-[0_0_0_1px_#406baa55]"
          : "border-line bg-surface-1 hover:-translate-y-px hover:border-[#465c79] hover:bg-surface-3",
        state === "not-received" && !selected && "opacity-75",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`Select ${file.fileName}`}
        className="flex min-w-0 flex-col gap-3 rounded-[17px] p-[9px] text-left min-[431px]:p-3"
      >
        <div className="flex h-[90px] items-center justify-center rounded-xl bg-[radial-gradient(ellipse_at_center,#28354a,#1c2634_72%)] min-[431px]:h-[112px]">
          <Glyph file={file} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold text-foreground min-[431px]:text-[13px]" title={file.fileName}>
            {file.fileName}
          </p>
          <p className="truncate text-[11px] text-ink-3">
            {typeLabel(file)} document · {formatBytes(file.objectSize)}
          </p>
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-[11px]">
          <span className="text-[11px] font-[580]" style={{ color: LEVEL[file.classification] }}>
            {file.classification}
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-ink-3">
            {state !== "stored" && <i className="inline-block size-1.5 rounded-full" style={{ background: statusColor(file) }} title={uploadStateCopy[state].label} aria-label={uploadStateCopy[state].label} />}
            {formatFinderDate(file.uploadedAt || file.createdAt)}
          </span>
        </div>
      </button>
      <ActionsMenu file={file} onView={onSelect} className="absolute right-4 top-4 border border-white/[0.08] bg-[#0d121a]/80 backdrop-blur min-[431px]:right-5 min-[431px]:top-5" />
    </div>
  );
}

function FileRow({ file, selected, onSelect }: { file: VaultFile; selected: boolean; onSelect: () => void }) {
  const state = uploadState(file);
  return (
    <div
      className={cn(
        "relative flex items-center rounded-[10px] border transition-colors duration-150",
        selected ? "border-[#5b96ed] bg-select" : "border-line bg-surface-1 hover:border-[#465c79]",
        state === "not-received" && !selected && "opacity-75",
      )}
    >
      <button type="button" onClick={onSelect} aria-pressed={selected} aria-label={`Select ${file.fileName}`} className="flex min-w-0 flex-1 items-center gap-3.5 rounded-[10px] p-[15px] pr-2 text-left">
        <span
          className="grid h-[34px] w-7 shrink-0 place-items-center rounded border border-[#577aa8] text-[7px] font-bold"
          style={{ color: fileKind(file.fileName, file.contentType) === "pdf" ? "#ffa2ab" : "#a4c9ff" }}
          aria-hidden
        >
          {typeLabel(file)}
        </span>
        <span className="min-w-0 flex-1">
          <strong className="block truncate text-[12px] font-semibold text-foreground">{file.fileName}</strong>
          <span className="block truncate text-[11px] text-ink-3">
            {typeLabel(file)} · {formatBytes(file.objectSize)} · {formatFinderDate(file.uploadedAt || file.createdAt)}
            {state !== "stored" && ` · ${uploadStateCopy[state].label}`}
          </span>
        </span>
        <span className="shrink-0 text-[11px] font-[580]" style={{ color: LEVEL[file.classification] }}>
          {file.classification}
        </span>
      </button>
      <ActionsMenu file={file} onView={onSelect} className="mr-2.5 shrink-0" />
    </div>
  );
}

/* ── Document Passport (approved reference) ───────────────────────── */

function Passport({ file }: { file: VaultFile }) {
  const { role, email } = useSession();
  const { download, busyId } = useDownload();
  const actions = useDocumentActions();
  const state = uploadState(file);
  const manage = canManage(file, role, email);
  const downloadable = canDownload(role) && state === "stored";
  const owner = file.uploadedBy === email ? "You" : file.uploadedBy || "Not recorded";

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between text-[13px] font-[680] text-foreground">
        <h2>Document Passport</h2>
        <ShieldCheck className="size-[18px] text-primary-hi" aria-hidden />
      </div>
      <div className="mb-3.5 mt-4 flex h-[150px] items-center justify-center rounded-xl bg-[radial-gradient(ellipse_at_center,#28354a,#1c2634_72%)]">
        <Glyph file={file} />
      </div>
      <h3 className="break-words text-[16px] font-semibold tracking-[-0.3px] text-foreground">{file.fileName}</h3>
      <p className="mt-1.5 text-[11px] text-ink-3">
        {kindLabel[fileKind(file.fileName, file.contentType)]} · {formatFinderDate(file.uploadedAt || file.createdAt)}
      </p>

      <dl className="mt-3.5">
        <Field label="Privacy">
          <span style={{ color: LEVEL[file.classification] }}>{file.classification}</span>
        </Field>
        <Field label="Status">
          <span style={{ color: statusColor(file) }} title={uploadStateCopy[state].detail}>
            {uploadStateCopy[state].label}
          </span>
        </Field>
        <Field label="Owner">
          <span className="block max-w-[180px] truncate" title={file.uploadedBy}>
            {owner}
          </span>
        </Field>
        <Field label="Size">{file.objectSize !== undefined ? formatBytes(file.objectSize) : "Not yet known"}</Field>
      </dl>

      <h4 className="mb-2.5 mt-[18px] text-[12px] font-[650] text-foreground">Document actions</h4>
      <div className="grid grid-cols-2 gap-2">
        <Act
          primary
          wide
          disabled={!downloadable || busyId === file.fileId}
          onClick={() => download(file)}
          title={!canDownload(role) ? "Your role can't download files" : state !== "stored" ? "Available once S3 confirms the file" : undefined}
        >
          {busyId === file.fileId ? (
            <>
              <Loader2 className="size-3.5 animate-spin" /> Requesting link…
            </>
          ) : (
            "View / Download"
          )}
        </Act>
        <Act disabled={!manage || state !== "stored"} pending={!integrations.replaceFile} onClick={() => actions.open("replace", file)}>
          Replace file
        </Act>
        <Act disabled={!manage} pending={!integrations.updateMetadata} onClick={() => actions.open("edit", file)}>
          Edit details
        </Act>
        {state === "not-received" && (
          <Act wide disabled={!manage} onClick={() => actions.retry(file)}>
            <RotateCw className="size-3.5" /> Re-upload
          </Act>
        )}
        <Act wide danger disabled={!manage} pending={!integrations.deleteFile} onClick={() => actions.open("delete", file)}>
          Delete file
        </Act>
      </div>

      <p className="mt-3 text-[10.5px] leading-[1.5] text-ink-3">
        {manage
          ? "Actions with an amber dot are pending API integration: they open their dialogs but can't change anything until the backend endpoints exist."
          : `Only an Admin or the document's owner can replace, edit or delete it. You're signed in as ${role}.`}
        {!canDownload(role) && " Auditors can't download files."}
      </p>

      <details className="group mt-3 border-t border-line pt-3 text-[12px]">
        <summary className="flex list-none items-center justify-between text-[11.5px] font-medium text-ink-3 hover:text-white">
          More details
          <span className="text-[10px] transition-transform group-open:rotate-180" aria-hidden>
            ▾
          </span>
        </summary>
        <dl className="mt-2">
          <Field label="S3 confirmed">{file.uploadedAt ? formatFull(file.uploadedAt) : "Not yet"}</Field>
          <Field label="Type">{file.contentType || "Not recorded"}</Field>
          {file.auditNote && <Field label="Note">{file.auditNote}</Field>}
          <Field label="File ID">
            <span className="break-all font-mono text-[10.5px]">{file.fileId}</span>
          </Field>
          <Field label="Versions">
            <span className="inline-flex items-center gap-1.5">
              Current only {!integrations.versionHistory && <PendingBadge />}
            </span>
          </Field>
        </dl>
        {!integrations.versionHistory && (
          <p className="mt-2 text-[10.5px] text-ink-3">
            Earlier versions appear once <code className="font-mono">{pendingEndpoints.versionHistory}</code> exists.
          </p>
        )}
        <Link href={`/files/${encodeURIComponent(file.fileId)}`} className="mt-2.5 inline-block text-[12px] font-medium text-primary-hi hover:text-white">
          Open full passport & access history →
        </Link>
      </details>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3.5 border-b border-line py-2.5 text-[12px]">
      <dt className="shrink-0 text-[11px] text-ink-3">{label}</dt>
      <dd className="min-w-0 text-right font-[550] text-foreground">{children}</dd>
    </div>
  );
}

function Act({
  children,
  onClick,
  primary,
  danger,
  wide,
  pending,
  disabled,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  primary?: boolean;
  danger?: boolean;
  wide?: boolean;
  pending?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "flex items-center justify-center gap-1.5 rounded-[9px] border px-2 py-[9px] text-[12px] transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-55",
        primary
          ? "border-[#4f84df] bg-[#2c64cc] text-white enabled:hover:bg-[#3672de]"
          : danger
            ? "border-[#693f4e] bg-surface-3 text-[#ff96a6] enabled:hover:bg-[#2b2330]"
            : "border-line-strong bg-surface-3 text-[#dbe5f4] enabled:hover:bg-[#2b3b53]",
        (wide || primary) && "col-span-2",
      )}
    >
      <span className="whitespace-nowrap">{children}</span>
      {pending && (
        <span className="flex items-center" title="Pending API — not connected yet">
          <i className="inline-block size-1.5 rounded-full bg-[#edc06a]" aria-hidden />
          <span className="sr-only">(pending API)</span>
        </span>
      )}
    </button>
  );
}

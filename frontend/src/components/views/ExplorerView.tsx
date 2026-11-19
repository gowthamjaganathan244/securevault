"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowDownUp, ChevronDown, CircleAlert, FolderOpen, LayoutGrid, List, Plus, RotateCw, SearchX } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/session";
import { useAudit, useFiles } from "@/lib/store";
import { prefetchSecurity, useSecurityMap, type Load, type SecurityRecord } from "@/lib/security";
import { inspectionLane, lanePosition, shortId, type LanePosition } from "@/lib/inspection";
import { formatBytes, formatFinderDate } from "@/lib/format";
import { classifications, fileExtension, isDenied, needsAttention, uploadState } from "@/lib/vault";
import { useMediaQuery } from "@/lib/useMediaQuery";
import type { ClassificationLevel, VaultFile } from "@/lib/types";
import { ButtonLink } from "@/components/ui/Button";
import { Notice, SearchField, Segmented, StatusPill, type Tone } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import { PageToolbar } from "@/components/shell/PageToolbar";
import { ActionsMenu } from "@/components/vault/ActionsMenu";
import { LaneStrip } from "@/components/inspection/Lane";
import { ClassificationTag, FileGlyph, TierMark, UploadStatus, classificationHex, classificationStyle, classificationTier } from "@/components/vault/tags";

// The passport is split out of the archive bundle; it loads the first time a document is opened.
const DocumentPassport = dynamic(() => import("@/components/vault/DocumentPassport").then((m) => m.DocumentPassport), {
  ssr: false,
  loading: () => <div className="h-[420px] animate-pulse bg-tint/[0.02]" aria-busy="true" aria-label="Opening passport" />,
});

type Level = "All" | ClassificationLevel;
type ViewMode = "gallery" | "list";
type SortKey = "newest" | "oldest" | "name" | "size" | "tier";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name", label: "Name A–Z" },
  { value: "size", label: "Largest first" },
  { value: "tier", label: "Most sensitive first" },
];

const dateOf = (f: VaultFile) => Date.parse(f.uploadedAt || f.createdAt || "") || 0;

const positionCopy: Record<LanePosition, { label: string; tone: Tone }> = {
  arrival: { label: "Arriving", tone: "info" },
  held: { label: "Held", tone: "warning" },
  uninspected: { label: "Not inspected", tone: "muted" },
  review: { label: "Flagged", tone: "warning" },
  archived: { label: "Inspected", tone: "success" },
};

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
  const [sort, setSort] = useState<SortKey>("newest");
  const [view, setView] = useState<ViewMode>("gallery");
  const searchRef = useRef<HTMLInputElement>(null);
  const wide = useMediaQuery("(min-width: 1180px)", true);

  const deniedIds = useMemo(() => new Set(events.filter(isDenied).map((e) => e.fileId ?? "")), [events]);
  const incompleteCount = useMemo(() => files.filter((f) => uploadState(f) === "not-received").length, [files]);

  const visible = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const list = files.filter((f) => {
      if (attentionOnly && !needsAttention(f, deniedIds)) return false;
      if (!attentionOnly && !showIncomplete && uploadState(f) === "not-received" && f.fileId !== selectedParam) return false;
      if (level !== "All" && f.classification !== level) return false;
      if (mineOnly && f.uploadedBy !== email) return false;
      if (terms.length) {
        const hay = `${f.fileName} ${f.uploadedBy ?? ""} ${f.classification} ${f.auditNote ?? ""} ${f.contentType ?? ""} ${f.fileId}`.toLowerCase();
        if (!terms.every((t) => hay.includes(t))) return false;
      }
      return true;
    });
    const by: Record<SortKey, (a: VaultFile, b: VaultFile) => number> = {
      newest: (a, b) => dateOf(b) - dateOf(a),
      oldest: (a, b) => dateOf(a) - dateOf(b),
      name: (a, b) => a.fileName.localeCompare(b.fileName),
      size: (a, b) => (b.objectSize ?? -1) - (a.objectSize ?? -1),
      tier: (a, b) => classificationTier[b.classification] - classificationTier[a.classification] || dateOf(b) - dateOf(a),
    };
    return list.sort(by[sort]);
  }, [files, query, level, mineOnly, attentionOnly, showIncomplete, deniedIds, email, selectedParam, sort]);

  // Inspection status for cards comes from the shared cache; load the first screenful politely.
  const securityOf = useSecurityMap(visible);
  useEffect(() => {
    const stored = visible.filter((f) => uploadState(f) === "stored").slice(0, 30);
    if (stored.length) void prefetchSecurity(stored);
  }, [visible]);

  const selected = useMemo(() => files.find((f) => f.fileId === selectedParam) ?? null, [files, selectedParam]);

  const select = useCallback((id: string | null) => {
    window.history.replaceState(null, "", id ? `/files?doc=${encodeURIComponent(id)}` : "/files");
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest("input, textarea, select, [contenteditable]");
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape" && !e.defaultPrevented && selectedParam && wide && !typing) select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [select, selectedParam, wide]);

  const filtersActive = !!query || level !== "All" || mineOnly || attentionOnly;
  const clearFilters = () => {
    setQuery("");
    setLevel("All");
    setMineOnly(false);
    setAttentionOnly(false);
  };
  const filterKey = `${query}|${level}|${mineOnly}|${attentionOnly}|${showIncomplete}|${sort}|${view}`;
  const panelOpen = !!selected && wide;

  return (
    <div className="min-h-full">
      <PageToolbar
        eyebrow="Protected archive"
        title="Archive"
        subtitle={loading ? "Opening the archive…" : `${files.length} catalogued document${files.length === 1 ? "" : "s"} in private storage`}
        actions={
          <ButtonLink href="/upload" variant="primary" className="max-sm:px-2.5">
            <Plus /> <span className="max-sm:sr-only">Check in</span>
          </ButtonLink>
        }
      >
        <SearchField
          inputRef={searchRef}
          label="Search the archive"
          value={query}
          onChange={setQuery}
          placeholder="Name, owner, ID, note or type"
          shortcut="/"
          className="w-full sm:w-80"
        />
        <div className="no-scrollbar -mx-1 flex max-w-full items-center gap-1 overflow-x-auto px-1" role="group" aria-label="Privacy level">
          {(["All", ...classifications] as Level[]).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={level === f}
              onClick={() => setLevel(f)}
              className={cn(
                "flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors duration-150",
                level === f ? "border-line-strong bg-surface-3 text-foreground" : "border-transparent text-ink-2 hover:bg-tint/[0.05]",
              )}
            >
              {f !== "All" && <TierMark level={f} className={classificationStyle[f].text} />}
              {f}
            </button>
          ))}
        </div>
      </PageToolbar>

      <div className="mx-auto w-full max-w-[1440px] px-4 pb-10 pt-4 sm:px-6">
        {/* Secondary controls */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <Toggle pressed={mineOnly} onClick={() => setMineOnly((m) => !m)}>
              Mine
            </Toggle>
            <Toggle pressed={attentionOnly} onClick={() => setAttentionOnly((a) => !a)} title="Uploads S3 hasn't confirmed, and documents with denied access attempts">
              Needs attention
            </Toggle>
            {incompleteCount > 0 && (
              <Toggle pressed={showIncomplete} onClick={() => setShowIncomplete((s) => !s)} title="Records where an upload link was issued but S3 never confirmed a file">
                Show held ({incompleteCount})
              </Toggle>
            )}
            <span className="tabular px-1 text-[12px] text-ink-3" aria-live="polite">
              {loading ? "Loading…" : `${visible.length} shown`}
            </span>
            <button
              type="button"
              onClick={() => refresh()}
              disabled={refreshing}
              aria-label="Refresh"
              title="Refresh"
              className="rounded-lg p-1.5 text-ink-3 transition-colors hover:bg-tint/[0.06] hover:text-foreground"
            >
              <RotateCw className={cn("size-3.5", refreshing && "animate-spin")} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <label className="relative">
              <span className="sr-only">Sort documents</span>
              <ArrowDownUp className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="h-[34px] appearance-none rounded-[11px] border border-line bg-surface-1 pl-8 pr-8 text-[12.5px] font-medium text-ink-2 outline-none transition-colors hover:border-line-strong focus:border-primary/60 [&>option]:bg-surface-2"
              >
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden />
            </label>
            <Segmented
              label="Archive view"
              size="sm"
              value={view}
              onChange={setView}
              options={[
                { value: "gallery", label: <><LayoutGrid /> <span className="max-sm:sr-only">Gallery</span></> },
                { value: "list", label: <><List /> <span className="max-sm:sr-only">List</span></> },
              ]}
            />
          </div>
        </div>

        <div className={cn("grid items-start gap-5", panelOpen && "grid-cols-[minmax(0,1fr)_420px]")}>
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
              <div className="grid grid-cols-[repeat(auto-fill,minmax(232px,1fr))] gap-3" aria-busy="true" aria-label="Loading documents">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-[158px] animate-pulse rounded-2xl border border-line bg-surface-1" />
                ))}
              </div>
            ) : visible.length === 0 ? (
              <Empty
                icon={files.length === 0 ? <FolderOpen /> : <SearchX />}
                text={files.length === 0 ? "The archive is empty. Check in a document to begin." : "No documents match these filters."}
                action={filtersActive ? { label: "Clear filters", onClick: clearFilters } : undefined}
              />
            ) : view === "gallery" ? (
              <ul key={filterKey} className="grid animate-fade-in grid-cols-[repeat(auto-fill,minmax(232px,1fr))] gap-3">
                {visible.map((f) => (
                  <li key={f.fileId} className="min-w-0">
                    <AssetCard file={f} security={securityOf(f.fileId, f.s3Key)} selected={f.fileId === selected?.fileId} onSelect={() => select(f.fileId)} />
                  </li>
                ))}
              </ul>
            ) : (
              <div key={filterKey} className="plate animate-fade-in overflow-hidden rounded-2xl">
                <div
                  aria-hidden
                  className="hidden grid-cols-[minmax(0,1fr)_128px_128px_132px_72px_96px_36px] items-center gap-3 border-b border-line px-4 py-2 md:grid xl:grid-cols-[minmax(0,1fr)_128px_128px_132px_180px_72px_96px_36px]"
                >
                  {["Document", "Privacy", "Storage", "Inspection"].map((h) => (
                    <span key={h} className="eyebrow">
                      {h}
                    </span>
                  ))}
                  <span className="eyebrow hidden xl:block">Owner</span>
                  <span className="eyebrow text-right">Size</span>
                  <span className="eyebrow">Date</span>
                  <span />
                </div>
                <ul className="divide-y divide-line">
                  {visible.map((f) => (
                    <li key={f.fileId}>
                      <AssetRow file={f} me={email} security={securityOf(f.fileId, f.s3Key)} selected={f.fileId === selected?.fileId} onSelect={() => select(f.fileId)} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {panelOpen && (
            <aside aria-label="Document passport" className="plate sticky top-4 max-h-[calc(100dvh-110px)] animate-slide-in-right overflow-y-auto overscroll-contain rounded-[20px]">
              <DocumentPassport key={selected.fileId} file={selected} onClose={() => select(null)} />
            </aside>
          )}
        </div>
      </div>

      {selected && !wide && (
        <Sheet label={`Document passport: ${selected.fileName}`} onClose={() => select(null)}>
          <DocumentPassport key={selected.fileId} file={selected} onClose={() => select(null)} />
        </Sheet>
      )}
    </div>
  );
}

function Toggle({ pressed, onClick, title, children }: { pressed: boolean; onClick: () => void; title?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      title={title}
      className={cn(
        "h-[34px] rounded-[11px] border px-3 text-[12.5px] font-medium transition-colors duration-150",
        pressed ? "border-primary/40 bg-primary/[0.1] text-primary-hi" : "border-line bg-surface-1 text-ink-2 hover:border-line-strong hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Empty({ icon, text, action }: { icon: ReactNode; text: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-5 py-16 text-center text-ink-3 [&>svg]:mb-3 [&>svg]:size-6">
      {icon}
      <p className="text-[13px]">{text}</p>
      {action && (
        <button type="button" onClick={action.onClick} className="mt-3 text-[12.5px] font-medium text-primary-hi hover:text-foreground">
          {action.label}
        </button>
      )}
    </div>
  );
}

function InspectionCell({ file, security }: { file: VaultFile; security: Load<SecurityRecord> }) {
  if (uploadState(file) !== "stored") return <span className="text-[12px] text-ink-3">—</span>;
  if (security.k === "idle" || security.k === "loading")
    return (
      <span className="text-[12px] text-ink-3" aria-label="Inspection status loading">
        Checking…
      </span>
    );
  if (security.k === "error") return <StatusPill tone="neutral">Unavailable</StatusPill>;
  const p = positionCopy[lanePosition(file, security)];
  return <StatusPill tone={p.tone}>{p.label}</StatusPill>;
}

/** A catalogued asset: tier stripe, catalogue number, identity and its lane at a glance. */
function AssetCard({ file, security, selected, onSelect }: { file: VaultFile; security: Load<SecurityRecord>; selected: boolean; onSelect: () => void }) {
  const state = uploadState(file);
  const stages = inspectionLane({ file, security });
  return (
    <div
      className={cn(
        "group relative flex h-full min-w-0 flex-col overflow-hidden rounded-2xl transition-[transform,box-shadow,border-color] duration-200 ease-[var(--ease-out-soft)]",
        selected ? "plate-raised shadow-[0_0_0_1.5px_var(--color-primary)]" : "plate hover:-translate-y-0.5 hover:shadow-[0_16px_32px_-20px_rgb(0_0_0/0.6)]",
        state === "not-received" && !selected && "opacity-75",
      )}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: classificationHex[file.classification] }} />
      <button type="button" onClick={onSelect} aria-pressed={selected} aria-label={`Open passport for ${file.fileName}`} className="flex min-w-0 flex-1 flex-col gap-3 p-3.5 pl-4 text-left">
        <span className="flex items-center justify-between gap-2 pr-7">
          <span className="font-mono text-[10.5px] tracking-[0.12em] text-ink-3">{shortId(file.fileId).toUpperCase()}</span>
        </span>
        <span className="flex min-w-0 items-start gap-3">
          <FileGlyph name={file.fileName} contentType={file.contentType} size="md" className="mt-0.5" />
          <span className="min-w-0">
            <span className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground" title={file.fileName}>
              {file.fileName}
            </span>
            <span className="mt-0.5 block truncate text-[11.5px] text-ink-3">
              {(fileExtension(file.fileName) || "file").toUpperCase()} · {formatBytes(file.objectSize)} · {formatFinderDate(file.uploadedAt || file.createdAt)}
            </span>
          </span>
        </span>
        <span className="mt-auto flex flex-wrap items-center gap-1.5">
          <ClassificationTag level={file.classification} compact />
          {state === "stored" ? <InspectionCell file={file} security={security} /> : <UploadStatus state={state} />}
        </span>
        <LaneStrip stages={stages} />
      </button>
      <ActionsMenu file={file} onView={onSelect} className="absolute right-2.5 top-2.5" />
    </div>
  );
}

function AssetRow({ file, me, security, selected, onSelect }: { file: VaultFile; me: string; security: Load<SecurityRecord>; selected: boolean; onSelect: () => void }) {
  const state = uploadState(file);
  return (
    <div className={cn("relative flex items-center transition-colors duration-150", selected ? "bg-primary/[0.07]" : "hover:bg-tint/[0.025]", state === "not-received" && !selected && "opacity-75")}>
      {selected && <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-primary" />}
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`Open passport for ${file.fileName}`}
        className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5 pl-4 pr-2 text-left md:grid-cols-[minmax(0,1fr)_128px_128px_132px_72px_96px] xl:grid-cols-[minmax(0,1fr)_128px_128px_132px_180px_72px_96px]"
      >
        <span className="flex min-w-0 items-center gap-3">
          <FileGlyph name={file.fileName} contentType={file.contentType} size="sm" />
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium text-foreground">{file.fileName}</span>
            <span className="block truncate font-mono text-[10.5px] tracking-wide text-ink-3 md:hidden">
              {formatBytes(file.objectSize)} · {formatFinderDate(file.uploadedAt || file.createdAt)}
            </span>
          </span>
        </span>
        <span className="md:hidden">
          <ClassificationTag level={file.classification} compact />
        </span>
        <span className="hidden md:block">
          <ClassificationTag level={file.classification} compact />
        </span>
        <span className="hidden md:block">
          <UploadStatus state={state} />
        </span>
        <span className="hidden md:block">
          <InspectionCell file={file} security={security} />
        </span>
        <span className="hidden truncate text-[12px] text-ink-2 xl:block" title={file.uploadedBy}>
          {file.uploadedBy === me ? "You" : file.uploadedBy || "—"}
        </span>
        <span className="tabular hidden text-right text-[12px] text-ink-2 md:block">{formatBytes(file.objectSize)}</span>
        <span className="tabular hidden text-[12px] text-ink-3 md:block">{formatFinderDate(file.uploadedAt || file.createdAt)}</span>
      </button>
      <ActionsMenu file={file} onView={onSelect} className="mr-2.5 shrink-0" />
    </div>
  );
}

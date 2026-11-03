"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowUpFromLine, ChevronDown, ChevronUp, CircleAlert, FolderOpen, LayoutGrid, List, RotateCw, SearchX } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/session";
import { useFiles } from "@/lib/store";
import { formatBytes, formatFinderDate } from "@/lib/format";
import { classifications, uploadState } from "@/lib/vault";
import { readPref, useMediaQuery, writePref } from "@/lib/useMediaQuery";
import type { ClassificationLevel, VaultFile } from "@/lib/types";
import { PageToolbar } from "@/components/shell/PageToolbar";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EmptyState, Notice, RowsSkeleton, SearchField, Segmented } from "@/components/ui/primitives";
import { ClassificationTag, FileGlyph, UploadStatus, classificationHex, classificationStyle } from "@/components/vault/tags";
import { DocumentPassport } from "@/components/vault/DocumentPassport";

type SortKey = "name" | "date" | "size";
type ViewMode = "list" | "gallery";
type Level = "All" | ClassificationLevel;

const dateOf = (f: VaultFile) => Date.parse(f.uploadedAt || f.createdAt || "") || 0;

export function ExplorerView() {
  const { email } = useSession();
  const { files, loading, error, refresh, refreshing } = useFiles();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("doc");

  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<Level>("All");
  const [mineOnly, setMineOnly] = useState(false);
  const [showIncomplete, setShowIncomplete] = useState(false);
  const [view, setView] = useState<ViewMode>(() =>
    typeof window === "undefined" ? "gallery" : readPref("sv.explorer.view", ["list", "gallery"] as const, "gallery"),
  );
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "date", dir: -1 });
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const docked = useMediaQuery("(min-width: 1280px)", true);

  const select = useCallback((id: string | null) => {
    const url = id ? `/files?doc=${encodeURIComponent(id)}` : "/files";
    window.history.replaceState(null, "", url);
  }, []);

  const incompleteCount = useMemo(() => files.filter((f) => uploadState(f) === "not-received").length, [files]);

  const visible = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const list = files.filter((f) => {
      if (!showIncomplete && uploadState(f) === "not-received" && f.fileId !== selectedId) return false;
      if (level !== "All" && f.classification !== level) return false;
      if (mineOnly && f.uploadedBy !== email) return false;
      if (terms.length) {
        const hay = `${f.fileName} ${f.uploadedBy ?? ""} ${f.classification} ${f.auditNote ?? ""} ${f.contentType ?? ""}`.toLowerCase();
        if (!terms.every((t) => hay.includes(t))) return false;
      }
      return true;
    });
    return list.sort((a, b) => {
      if (sort.key === "name") return a.fileName.localeCompare(b.fileName, undefined, { numeric: true }) * sort.dir;
      if (sort.key === "size") return ((a.objectSize ?? -1) - (b.objectSize ?? -1)) * sort.dir;
      return (dateOf(a) - dateOf(b)) * sort.dir;
    });
  }, [files, query, level, mineOnly, showIncomplete, sort, email, selectedId]);

  const selected = useMemo(() => files.find((f) => f.fileId === selectedId) ?? null, [files, selectedId]);

  // Keyboard: "/" focuses search, Esc closes the inspector, arrows move the selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.closest("input, textarea, [contenteditable]");
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "Escape" && selectedId && !document.querySelector('[role="dialog"][aria-label="Search SecureVault"]')) {
        select(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [select, selectedId]);

  const onListKey = (e: React.KeyboardEvent) => {
    if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key) || visible.length === 0) return;
    e.preventDefault();
    const i = visible.findIndex((f) => f.fileId === selectedId);
    let next = i;
    if (e.key === "Home") next = 0;
    else if (e.key === "End") next = visible.length - 1;
    else if (e.key === "ArrowDown" || e.key === "ArrowRight") next = i < 0 ? 0 : Math.min(i + 1, visible.length - 1);
    else next = i < 0 ? 0 : Math.max(i - 1, 0);
    const id = visible[next].fileId;
    select(id);
    listRef.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)?.focus();
  };

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "name" ? 1 : -1 }));

  const filtersActive = query || level !== "All" || mineOnly;
  const clearFilters = () => {
    setQuery("");
    setLevel("All");
    setMineOnly(false);
  };

  return (
    <div className="flex h-full min-h-0">
      <section className={cn("@container flex min-w-0 flex-1 flex-col", docked && "overflow-y-auto")} aria-label="Documents">
        <PageToolbar
          title="Explorer"
          subtitle={
            loading ? "Loading documents…" : `${visible.length} of ${files.length} document${files.length === 1 ? "" : "s"}`
          }
          actions={
            <>
              <Segmented
                label="View"
                value={view}
                onChange={(v) => {
                  setView(v);
                  writePref("sv.explorer.view", v);
                }}
                options={[
                  { value: "gallery", label: <LayoutGrid />, title: "Gallery" },
                  { value: "list", label: <List />, title: "List" },
                ]}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Refresh"
                title="Refresh"
                onClick={() => refresh()}
                disabled={refreshing}
              >
                <RotateCw className={cn(refreshing && "animate-spin")} />
              </Button>
              <ButtonLink href="/upload" variant="primary" className="max-sm:hidden">
                <ArrowUpFromLine /> Upload
              </ButtonLink>
            </>
          }
          bottom={
            view === "list" && visible.length > 0 && !loading ? (
              <div className="px-2 sm:px-4">
                <div
                  className="hidden h-8 grid-cols-[minmax(0,1fr)_118px_96px_86px_104px] items-center gap-3 border-t border-line px-3 text-[11.5px] font-medium text-ink-3 @2xl:grid @4xl:grid-cols-[minmax(0,1fr)_118px_minmax(0,170px)_110px_80px_110px]"
                  role="presentation"
                >
                  <SortHeader label="Name" active={sort.key === "name"} dir={sort.dir} onClick={() => toggleSort("name")} />
                  <span>Privacy</span>
                  <span className="hidden @4xl:block">Owner</span>
                  <SortHeader label="Added" active={sort.key === "date"} dir={sort.dir} onClick={() => toggleSort("date")} />
                  <SortHeader label="Size" active={sort.key === "size"} dir={sort.dir} onClick={() => toggleSort("size")} />
                  <span>Status</span>
                </div>
              </div>
            ) : undefined
          }
        >
          <SearchField
            inputRef={searchRef}
            label="Filter documents"
            value={query}
            onChange={setQuery}
            placeholder="Filter by name, owner or note"
            className="w-full sm:w-64"
          />
          <div className="no-scrollbar -mx-4 flex max-w-[calc(100%+2rem)] items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:max-w-none sm:px-0">
            <Segmented
              label="Privacy level"
              size="sm"
              value={level}
              onChange={setLevel}
              options={[
                { value: "All", label: "All" },
                ...classifications.map((c) => ({
                  value: c,
                  label: (
                    <>
                      <span className={cn("size-1.5 rounded-full", classificationStyle[c].dot)} aria-hidden />
                      {c}
                    </>
                  ),
                })),
              ]}
            />
            <button
              type="button"
              aria-pressed={mineOnly}
              onClick={() => setMineOnly((m) => !m)}
              className={cn(
                "h-7 shrink-0 rounded-lg border px-2.5 text-[12px] font-medium transition-colors duration-[160ms]",
                mineOnly ? "border-primary/40 bg-primary/15 text-foreground" : "border-line text-ink-3 hover:text-foreground",
              )}
            >
              Mine
            </button>
            {incompleteCount > 0 && (
              <button
                type="button"
                aria-pressed={showIncomplete}
                onClick={() => setShowIncomplete((s) => !s)}
                title="Records where an upload link was issued but S3 never confirmed a file"
                className={cn(
                  "h-7 shrink-0 rounded-lg border px-2.5 text-[12px] font-medium transition-colors duration-[160ms]",
                  showIncomplete ? "border-warning/40 bg-warning/10 text-foreground" : "border-line text-ink-3 hover:text-foreground",
                )}
              >
                {showIncomplete ? "Hide" : "Show"} {incompleteCount} incomplete
              </button>
            )}
          </div>
        </PageToolbar>

        <div className="flex-1 px-2 pb-2 sm:px-4">
          {error && files.length === 0 ? (
            <div className="px-2 py-4">
              <Notice
                tone="danger"
                icon={<CircleAlert />}
                action={
                  <Button size="sm" onClick={() => refresh()}>
                    Try again
                  </Button>
                }
              >
                {error} Check your connection and try again.
              </Notice>
            </div>
          ) : loading ? (
            <RowsSkeleton rows={8} />
          ) : files.length === 0 ? (
            <EmptyState
              icon={<FolderOpen />}
              title="The vault is empty"
              action={
                <ButtonLink href="/upload" variant="primary">
                  <ArrowUpFromLine /> Upload a document
                </ButtonLink>
              }
            >
              Documents you upload are stored privately in S3 and appear here once confirmed.
            </EmptyState>
          ) : visible.length === 0 ? (
            <EmptyState
              icon={<SearchX />}
              title="No documents match"
              action={
                filtersActive ? (
                  <Button size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            >
              {filtersActive ? "Try a different name or privacy level." : "Only incomplete uploads exist right now."}
            </EmptyState>
          ) : view === "list" ? (
            <div ref={listRef} onKeyDown={onListKey}>
              <div role="listbox" aria-label="Documents" className="py-1">
                {visible.map((f) => (
                  <FileRow key={f.fileId} file={f} me={email} selected={f.fileId === selectedId} onSelect={select} />
                ))}
              </div>
            </div>
          ) : (
            <div
              ref={listRef}
              onKeyDown={onListKey}
              role="listbox"
              aria-label="Documents"
              className="grid grid-cols-[repeat(auto-fill,minmax(148px,1fr))] gap-2 p-1"
            >
              {visible.map((f) => (
                <FileTile key={f.fileId} file={f} selected={f.fileId === selectedId} onSelect={select} />
              ))}
            </div>
          )}
        </div>
      </section>

      {selected &&
        (docked ? (
          <aside
            key={selected.fileId}
            aria-label="Inspector"
            className="w-[380px] shrink-0 animate-slide-in-right overflow-y-auto border-l border-line bg-surface-1"
          >
            <DocumentPassport file={selected} onClose={() => select(null)} />
          </aside>
        ) : (
          <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`Passport for ${selected.fileName}`}>
            <div className="absolute inset-0 animate-fade-in bg-black/45" onClick={() => select(null)} aria-hidden />
            <div
              key={selected.fileId}
              className="glass absolute inset-x-0 bottom-0 max-h-[88dvh] !bg-[rgba(17,17,21,0.97)] animate-sheet-up overflow-y-auto rounded-t-2xl pb-safe md:inset-x-auto md:bottom-3 md:right-3 md:top-3 md:max-h-none md:w-[400px] md:animate-slide-in-right md:rounded-2xl"
            >
              <div className="sticky top-0 z-10 flex justify-center pt-2 md:hidden" aria-hidden>
                <span className="h-1 w-9 rounded-full bg-white/20" />
              </div>
              <DocumentPassport file={selected} onClose={() => select(null)} />
            </div>
          </div>
        ))}
    </div>
  );
}

function SortHeader({ label, active, dir, onClick }: { label: string; active: boolean; dir: 1 | -1; onClick: () => void }) {
  const Icon = dir === 1 ? ChevronUp : ChevronDown;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Sort by ${label}`}
      className={cn("flex items-center gap-1 text-left transition-colors hover:text-foreground", active && "text-ink-2")}
    >
      {label}
      {active && <Icon className="size-3" />}
    </button>
  );
}

function FileRow({
  file,
  me,
  selected,
  onSelect,
}: {
  file: VaultFile;
  me: string;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const state = uploadState(file);
  const owner = file.uploadedBy === me ? "You" : file.uploadedBy || "—";
  return (
    <div
      role="option"
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      data-id={file.fileId}
      onClick={() => onSelect(file.fileId)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(file.fileId);
        }
      }}
      className={cn(
        "group grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-3 py-1.5 outline-none transition-colors duration-[120ms] @2xl:grid-cols-[minmax(0,1fr)_118px_96px_86px_104px] @4xl:grid-cols-[minmax(0,1fr)_118px_minmax(0,170px)_110px_80px_110px]",
        "focus-visible:shadow-[inset_0_0_0_2px_rgba(96,165,250,0.7)]",
        selected ? "bg-primary/[0.16]" : "hover:bg-white/[0.04]",
        state === "not-received" && !selected && "opacity-70",
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <FileGlyph name={file.fileName} contentType={file.contentType} />
        <div className="min-w-0">
          <p className="truncate text-[13.5px] text-foreground">{file.fileName}</p>
          <p className="truncate text-[12px] text-ink-3 @2xl:hidden">
            {file.classification} · {formatBytes(file.objectSize)} · {formatFinderDate(file.uploadedAt || file.createdAt)}
          </p>
        </div>
      </div>
      <div className="hidden @2xl:block">
        <ClassificationTag level={file.classification} compact />
      </div>
      <span className="hidden truncate text-[12.5px] text-ink-2 @4xl:block" title={file.uploadedBy}>
        {owner}
      </span>
      <span className="tabular hidden text-[12.5px] text-ink-2 @2xl:block">{formatFinderDate(file.uploadedAt || file.createdAt)}</span>
      <span className="tabular hidden text-[12.5px] text-ink-2 @2xl:block">{formatBytes(file.objectSize)}</span>
      <UploadStatus state={state} />
    </div>
  );
}

function FileTile({ file, selected, onSelect }: { file: VaultFile; selected: boolean; onSelect: (id: string) => void }) {
  const state = uploadState(file);
  return (
    <div
      role="option"
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      data-id={file.fileId}
      onClick={() => onSelect(file.fileId)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(file.fileId);
        }
      }}
      className={cn(
        "group flex flex-col rounded-xl border p-2 outline-none transition-[background-color,border-color] duration-[160ms]",
        "focus-visible:shadow-[0_0_0_2px_rgba(96,165,250,0.7)]",
        selected ? "border-primary/50 bg-primary/[0.12]" : "border-transparent hover:bg-white/[0.04]",
        state === "not-received" && !selected && "opacity-70",
      )}
    >
      <div
        className="flex aspect-[4/3] items-center justify-center rounded-lg border border-line bg-surface-2"
        style={{ backgroundImage: `radial-gradient(120% 90% at 50% 0%, ${classificationHex[file.classification]}22, transparent 65%)` }}
      >
        <FileGlyph name={file.fileName} contentType={file.contentType} size="xl" className="transition-transform duration-[200ms] group-hover:-translate-y-0.5" />
      </div>
      <p className="mt-2 line-clamp-2 break-words px-0.5 text-center text-[12.5px] leading-snug text-foreground">{file.fileName}</p>
      <div className="mt-1.5 flex items-center justify-center gap-1.5">
        <ClassificationTag level={file.classification} compact />
        <UploadStatus state={state} withLabel={false} />
      </div>
    </div>
  );
}

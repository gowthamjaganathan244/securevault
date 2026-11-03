"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowUpFromLine, ChevronLeft, ChevronRight, CircleAlert, FolderOpen, History, ShieldX } from "lucide-react";
import { useSession } from "@/lib/session";
import { useAudit, useFiles } from "@/lib/store";
import { formatBytes, formatFinderDate, relativeTime } from "@/lib/format";
import { handOffFile } from "@/lib/handoff";
import { classifications, deniedWithin, hasRealActor, hasRealFile, isDenied, scopeEvents, sortByRecent, uploadState } from "@/lib/vault";
import type { AuditEvent, VaultFile } from "@/lib/types";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState, Notice, Segmented, Skeleton } from "@/components/ui/primitives";
import { ClassificationTag, FileGlyph, UploadStatus, classificationHex } from "@/components/vault/tags";
import { VaultCore, type CoreRing } from "@/components/vault/VaultCore";
import { ActivityLine } from "./ActivityView";

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/** "3 min ago" reads naturally on its own; calendar dates need "on". */
function whenPhrase(ts: string) {
  const rel = relativeTime(ts);
  return /ago$|now$/.test(rel) ? rel : `on ${rel}`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function DeskView() {
  const router = useRouter();
  const { displayName, role, email } = useSession();
  const canBrowse = role !== "Auditor";
  const { files, loading: filesLoading, error: filesError } = useFiles(canBrowse);
  const { events, loading: auditLoading, error: auditError } = useAudit();
  const [tab, setTab] = useState<"added" | "opened">("added");
  const [dragging, setDragging] = useState(false);

  const scoped = useMemo(() => scopeEvents(events, role, email), [events, role, email]);
  const stored = useMemo(() => files.filter((f) => uploadState(f) === "stored"), [files]);
  const recentAdded = useMemo(() => sortByRecent(stored).slice(0, 12), [stored]);

  // "Opened by you" comes from your own successful downloads in the audit log.
  const recentOpened = useMemo(() => {
    const byId = new Map(files.map((f) => [f.fileId, f]));
    const seen = new Set<string>();
    const out: { file: VaultFile; at: string }[] = [];
    for (const e of events) {
      if (e.userEmail !== email || e.action !== "FILE_DOWNLOADED" || !e.fileId || seen.has(e.fileId)) continue;
      const f = byId.get(e.fileId);
      if (!f) continue;
      seen.add(e.fileId);
      out.push({ file: f, at: e.timestamp });
      if (out.length === 12) break;
    }
    return out;
  }, [events, files, email]);

  const myPending = useMemo(() => files.filter((f) => f.uploadedBy === email && uploadState(f) === "awaiting"), [files, email]);
  const deniedThisWeek = useMemo(() => deniedWithin(scoped, 7), [scoped]);

  // Every light in the core is a real record.
  const rings = useMemo<CoreRing[]>(() => {
    if (canBrowse) {
      const live = sortByRecent(files.filter((f) => ["stored", "awaiting"].includes(uploadState(f))));
      return classifications.map((c) => ({
        key: c,
        label: c,
        color: classificationHex[c],
        items: live
          .filter((f) => f.classification === c)
          .map((f) => ({
            id: f.fileId,
            label: f.fileName,
            detail: uploadState(f) === "stored" ? `${formatFinderDate(f.uploadedAt)} · ${formatBytes(f.objectSize)}` : "Awaiting S3",
            href: `/files?doc=${encodeURIComponent(f.fileId)}`,
            hollow: uploadState(f) !== "stored",
          })),
      }));
    }
    const recent = scoped.slice(0, 120);
    const toItem = (e: AuditEvent) => ({
      id: e.auditId,
      label: hasRealFile(e) ? e.fileName || "A document" : "Unspecified document",
      detail: `${hasRealActor(e) ? e.userEmail : "Unidentified"} · ${relativeTime(e.timestamp)}`,
    });
    return [
      { key: "allowed", label: "Allowed", color: "#34d399", items: recent.filter((e) => !isDenied(e)).map(toItem) },
      { key: "denied", label: "Denied", color: "#fb7185", items: recent.filter(isDenied).map(toItem) },
    ];
  }, [canBrowse, files, scoped]);

  const newestId = canBrowse ? sortByRecent(stored)[0]?.fileId : scoped[0]?.auditId;
  const coreLoading = canBrowse ? filesLoading : auditLoading;
  const awaitingCount = files.filter((f) => uploadState(f) === "awaiting").length;
  const restricted = stored.filter((f) => f.classification === "Restricted").length;
  const lastEvent = scoped[0];

  const dropProps = canBrowse
    ? {
        onDragOver: (e: React.DragEvent) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDragging(true);
        },
        onDragLeave: (e: React.DragEvent) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
        },
        onDrop: (e: React.DragEvent) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) {
            handOffFile(f);
            router.push("/upload");
          }
        },
      }
    : {};

  const today = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" }).format(new Date());

  // The headline is a sentence written from real numbers.
  const headline = canBrowse
    ? stored.length === 0
      ? ["Your vault is ready", "for its first document."]
      : [`${plural(stored.length, "document")},`, "sealed and accounted for."]
    : [`${plural(scoped.length, "event")},`, "recorded and accounted for."];
  const narrative = [
    canBrowse && restricted > 0 && `${restricted} ${restricted === 1 ? "is" : "are"} Restricted.`,
    canBrowse && awaitingCount > 0 && `${plural(awaitingCount, "upload")} awaiting S3 confirmation.`,
    !canBrowse && deniedThisWeek.length > 0 && `${plural(deniedThisWeek.length, "denied attempt")} this week.`,
    lastEvent ? `Last recorded access ${whenPhrase(lastEvent.timestamp)}.` : "No access has been recorded yet.",
  ].filter(Boolean);

  return (
    <div className="relative min-h-full" {...dropProps}>
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-40 flex animate-fade-in items-center justify-center bg-background/70 p-6">
          <div className="glass flex flex-col items-center rounded-2xl border-primary/40 px-10 py-8 text-center">
            <ArrowUpFromLine className="mb-3 size-6 text-primary-hi" />
            <p className="text-[15px] font-medium">Drop to start a secure upload</p>
            <p className="mt-1 text-[12.5px] text-ink-3">You&apos;ll choose its privacy level next</p>
          </div>
        </div>
      )}

      {/* ── Hero ─────────────────────────────────────────── */}
      <section aria-label="Vault overview" className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute right-[-10%] top-[-30%] h-[620px] w-[620px] rounded-full opacity-70 max-lg:right-1/2 max-lg:translate-x-1/2"
          style={{ background: "radial-gradient(closest-side, rgba(52,121,237,0.16), transparent)" }}
        />
        <div className="relative mx-auto grid w-full max-w-[1180px] items-center gap-4 px-5 pb-6 pt-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:gap-10 lg:pb-8 lg:pt-10">
          <div className="animate-rise">
            <p className="flex items-center gap-2 text-[12.5px] text-ink-3">
              <span>{today}</span>
              <span aria-hidden className="size-1 rounded-full bg-ink-3/60" />
              <span>
                {greeting()}, <span className="capitalize text-ink-2">{displayName}</span>
              </span>
            </p>
            <h1 className="mt-3 text-[30px] font-semibold leading-[1.06] tracking-[-0.035em] text-foreground sm:text-[40px] xl:text-[46px]">
              {coreLoading ? (
                <>
                  <Skeleton className="h-[0.9em] w-[70%]" />
                  <Skeleton className="mt-3 h-[0.9em] w-[90%]" />
                </>
              ) : (
                <>
                  <span className="tabular block text-balance">{headline[0]}</span>
                  <span className="block text-balance bg-linear-to-r from-primary-hi via-[#93c5fd] to-[#c7d2fe] bg-clip-text text-transparent">
                    {headline[1]}
                  </span>
                </>
              )}
            </h1>
            {!coreLoading && (
              <p className="mt-5 max-w-md text-[15px] leading-relaxed text-ink-2">
                {narrative.join(" ")} <span className="text-ink-3">Signed in as {role}.</span>
              </p>
            )}
            <div className="mt-7 flex flex-wrap items-center gap-2.5">
              {canBrowse ? (
                <>
                  <ButtonLink href="/upload" variant="primary" size="lg" className="h-11 rounded-full px-5">
                    <ArrowUpFromLine /> Upload
                  </ButtonLink>
                  <ButtonLink href="/files" variant="secondary" size="lg" className="h-11 rounded-full px-5">
                    Open Explorer
                  </ButtonLink>
                  <span className="ml-1 hidden text-[12.5px] text-ink-3 sm:inline">or drop a file anywhere</span>
                </>
              ) : (
                <ButtonLink href="/audit-logs" variant="primary" size="lg" className="h-11 rounded-full px-5">
                  <History /> Open Activity
                </ButtonLink>
              )}
            </div>
          </div>

          <div className="animate-rise [animation-delay:90ms]">
            {coreLoading ? (
              <div className="mx-auto aspect-square w-full max-w-[380px] animate-pulse rounded-full border border-white/[0.04] bg-white/[0.015]" />
            ) : (
              <VaultCore
                rings={rings}
                newestId={newestId}
                idleCaption={
                  canBrowse
                    ? `${stored.length} sealed${awaitingCount ? ` · ${awaitingCount} awaiting S3` : ""} — point at a light to identify it`
                    : "Each light is a recorded access attempt"
                }
              />
            )}
            {!coreLoading && (
              <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-[12px]">
                {rings.map((r) => (
                  <li key={r.key} className="flex items-center gap-1.5 text-ink-3">
                    <span className="size-1.5 rounded-full" style={{ background: r.color, boxShadow: `0 0 8px ${r.color}` }} aria-hidden />
                    {r.label}
                    <span className="tabular text-ink-2">{r.items.length}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-[1180px] space-y-10 px-5 pb-12 sm:px-8">
        {/* ── Filmstrip ─────────────────────────────────── */}
        {canBrowse && (
          <section aria-labelledby="strip-title" className="reveal">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">Documents</p>
                <h2 id="strip-title" className="mt-1 text-[20px] font-semibold tracking-[-0.02em]">
                  {tab === "added" ? "Recently sealed" : "Opened by you"}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <Segmented
                  label="Document list"
                  size="sm"
                  value={tab}
                  onChange={setTab}
                  options={[
                    { value: "added", label: "Recently sealed" },
                    { value: "opened", label: "Opened by you" },
                  ]}
                />
                <Link href="/files" className="hidden items-center gap-1 pl-2 text-[12.5px] font-medium text-ink-3 transition-colors hover:text-foreground sm:flex">
                  Explorer <ArrowRight className="size-3.5" />
                </Link>
              </div>
            </div>
            {filesError && files.length === 0 ? (
              <Notice tone="danger" icon={<CircleAlert />}>
                {filesError}
              </Notice>
            ) : filesLoading || (tab === "opened" && auditLoading) ? (
              <div className="flex gap-3 overflow-hidden">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-[214px] w-[188px] shrink-0 rounded-2xl" />
                ))}
              </div>
            ) : tab === "added" ? (
              recentAdded.length === 0 ? (
                <EmptyState
                  icon={<FolderOpen />}
                  title="Nothing sealed yet"
                  className="rounded-2xl border border-dashed border-line"
                  action={
                    <ButtonLink href="/upload" variant="primary" size="sm">
                      Upload your first
                    </ButtonLink>
                  }
                >
                  Documents appear here once S3 confirms them.
                </EmptyState>
              ) : (
                <Filmstrip items={recentAdded.map((f) => ({ file: f, meta: formatFinderDate(f.uploadedAt || f.createdAt) }))} me={email} />
              )
            ) : recentOpened.length === 0 ? (
              <EmptyState icon={<History />} title="Nothing opened yet" className="rounded-2xl border border-dashed border-line">
                Documents you download appear here, taken from the audit log.
              </EmptyState>
            ) : (
              <Filmstrip items={recentOpened.map(({ file, at }) => ({ file, meta: `Opened ${relativeTime(at)}` }))} me={email} />
            )}
          </section>
        )}

        {/* ── Ledger + attention ────────────────────────── */}
        <div className="reveal grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section aria-labelledby="ledger-title">
            <div className="mb-3 flex items-end justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">Ledger</p>
                <h2 id="ledger-title" className="mt-1 text-[20px] font-semibold tracking-[-0.02em]">
                  {role === "User" ? "Your activity" : "Recent activity"}
                </h2>
              </div>
              <Link href="/audit-logs" className="flex items-center gap-1 text-[12.5px] font-medium text-ink-3 transition-colors hover:text-foreground">
                Full timeline <ArrowRight className="size-3.5" />
              </Link>
            </div>
            {auditError && events.length === 0 ? (
              <Notice tone="danger" icon={<CircleAlert />}>
                {auditError}
              </Notice>
            ) : auditLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : scoped.length === 0 ? (
              <p className="border-t border-line pt-4 text-[13px] text-ink-3">No recorded activity yet. Downloads and denied downloads appear here.</p>
            ) : (
              <ol className="divide-y divide-line border-y border-line">
                {scoped.slice(0, canBrowse ? 6 : 12).map((e) => (
                  <ActivityLine key={e.auditId} event={e} me={email} linkFiles={canBrowse && hasRealFile(e)} />
                ))}
              </ol>
            )}
          </section>

          <section aria-labelledby="attention-title">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">Signals</p>
            <h2 id="attention-title" className="mb-3 mt-1 text-[20px] font-semibold tracking-[-0.02em]">
              Needs attention
            </h2>
            {myPending.length === 0 && deniedThisWeek.length === 0 ? (
              <p className="border-t border-line pt-4 text-[13px] leading-relaxed text-ink-3">
                No uploads awaiting S3{canBrowse ? " from you" : ""} and no denied attempts this week.
              </p>
            ) : (
              <ul className="space-y-2">
                {myPending.length > 0 && (
                  <li>
                    <Link
                      href="/files"
                      className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/[0.05] p-4 text-[13px] transition-colors hover:bg-primary/[0.09]"
                    >
                      <span className="mt-1.5">
                        <UploadStatus state="awaiting" withLabel={false} />
                      </span>
                      <span className="text-ink-2">
                        <span className="block font-medium text-foreground">{plural(myPending.length, "upload")} awaiting S3</span>
                        Not yet confirmed as stored.
                      </span>
                    </Link>
                  </li>
                )}
                {deniedThisWeek.length > 0 && (
                  <li>
                    <Link
                      href="/audit-logs?result=denied"
                      className="flex items-start gap-3 rounded-2xl border border-danger/20 bg-danger/[0.05] p-4 text-[13px] transition-colors hover:bg-danger/[0.09]"
                    >
                      <ShieldX className="mt-0.5 size-4 shrink-0 text-danger" />
                      <span className="text-ink-2">
                        <span className="block font-medium text-foreground">{plural(deniedThisWeek.length, "denied attempt")} this week</span>
                        {role === "User" ? "Recorded against your account." : "Recorded in the audit log."}
                      </span>
                    </Link>
                  </li>
                )}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/** A horizontally scrolling strip of document cards, snapped like a contact sheet. */
function Filmstrip({ items, me }: { items: { file: VaultFile; meta: string }[]; me: string }) {
  const ref = useRef<HTMLUListElement>(null);
  const scrollBy = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * 420, behavior: "smooth" });
  return (
    <div className="group/strip relative">
      <ul
        ref={ref}
        className="no-scrollbar -mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-5 px-5 pb-2 sm:-mx-8 sm:scroll-px-8 sm:px-8"
        style={{ maskImage: "linear-gradient(to right, transparent, #000 20px, #000 calc(100% - 48px), transparent)" }}
      >
        {items.map(({ file, meta }) => (
          <li key={file.fileId} className="w-[188px] shrink-0 snap-start">
            <DocCard file={file} meta={meta} mine={file.uploadedBy === me} />
          </li>
        ))}
      </ul>
      {items.length > 4 && (
        <>
          <button
            type="button"
            aria-label="Scroll back"
            onClick={() => scrollBy(-1)}
            className="glass absolute -left-3 top-[72px] hidden size-9 items-center justify-center rounded-full text-ink-2 opacity-0 transition-opacity duration-[180ms] hover:text-foreground focus-visible:opacity-100 group-hover/strip:opacity-100 lg:flex"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Scroll forward"
            onClick={() => scrollBy(1)}
            className="glass absolute -right-3 top-[72px] hidden size-9 items-center justify-center rounded-full text-ink-2 opacity-0 transition-opacity duration-[180ms] hover:text-foreground focus-visible:opacity-100 group-hover/strip:opacity-100 lg:flex"
          >
            <ChevronRight className="size-4" />
          </button>
        </>
      )}
    </div>
  );
}

function DocCard({ file, meta, mine }: { file: VaultFile; meta: string; mine: boolean }) {
  const tint = classificationHex[file.classification] ?? "#60a5fa";
  return (
    <Link href={`/files?doc=${encodeURIComponent(file.fileId)}`} className="group block rounded-2xl outline-none">
      <div
        className="relative flex h-[148px] items-center justify-center overflow-hidden rounded-2xl border border-white/[0.06] bg-surface-1 transition-[border-color,transform,box-shadow] duration-[220ms] ease-[var(--ease-out-soft)] group-hover:-translate-y-1 group-hover:border-white/[0.12] group-hover:shadow-[0_18px_40px_-18px_rgba(0,0,0,0.9)] group-focus-visible:shadow-[0_0_0_2px_rgba(139,185,255,0.8)]"
        style={{ backgroundImage: `radial-gradient(120% 90% at 50% 0%, ${tint}26, transparent 65%)` }}
      >
        <span
          aria-hidden
          className="absolute size-[88px] rounded-full border opacity-60 transition-transform duration-[300ms] group-hover:scale-110"
          style={{ borderColor: `${tint}40` }}
        />
        <FileGlyph name={file.fileName} contentType={file.contentType} size="xl" className="relative drop-shadow-[0_10px_18px_rgba(0,0,0,0.55)]" />
        <ClassificationTag level={file.classification} compact className="absolute bottom-2.5 left-2.5 bg-background/70 backdrop-blur" />
      </div>
      <p className="mt-2.5 line-clamp-2 px-0.5 text-[13px] leading-snug text-foreground">{file.fileName}</p>
      <p className="mt-0.5 truncate px-0.5 text-[12px] text-ink-3">
        {meta} · {formatBytes(file.objectSize)}
        {mine ? "" : ` · ${file.uploadedBy ?? "Unknown owner"}`}
      </p>
    </Link>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowUpFromLine, CircleAlert, CircleSlash, FileWarning, Link2, ScanLine, ShieldX } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/session";
import { useAudit, useFiles } from "@/lib/store";
import { prefetchSecurity, useScan, useSecurity, useSecurityMap } from "@/lib/security";
import { LANE_POSITIONS, UNSUPPORTED_CHECKS, inspectionLane, lanePosition, shortId, type LanePosition } from "@/lib/inspection";
import { formatBytes, formatFinderDate } from "@/lib/format";
import { handOffFile } from "@/lib/handoff";
import { deniedWithin, hasRealFile, scopeEvents, sortByRecent, uploadState } from "@/lib/vault";
import type { VaultFile } from "@/lib/types";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState, Notice, Skeleton, toneDot } from "@/components/ui/primitives";
import { InspectionLane } from "@/components/inspection/Lane";
import { ClassificationTag, FileGlyph, alpha, classificationHex } from "@/components/vault/tags";
import { ActivityLine } from "./ActivityView";

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function DeskView() {
  const router = useRouter();
  const { displayName, role, email } = useSession();
  const canBrowse = role !== "Auditor";
  const { files, loading: filesLoading, error: filesError } = useFiles(canBrowse);
  const { events, loading: auditLoading, error: auditError } = useAudit();
  const [dragging, setDragging] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);

  const scoped = useMemo(() => scopeEvents(events, role, email), [events, role, email]);
  const live = useMemo(() => sortByRecent(files), [files]);
  const stored = useMemo(() => live.filter((f) => uploadState(f) === "stored"), [live]);
  const onLane = useMemo(() => live.filter((f) => uploadState(f) !== "not-received" && uploadState(f) !== "unknown"), [live]);
  const held = useMemo(() => live.filter((f) => uploadState(f) === "not-received"), [live]);

  // Place documents on the board from their real inspection records (loaded politely, cached for every view).
  const securityOf = useSecurityMap(stored);
  useEffect(() => {
    if (canBrowse && stored.length) void prefetchSecurity(stored.slice(0, 60));
  }, [canBrowse, stored]);

  const board = useMemo(() => {
    const groups: Record<LanePosition, VaultFile[]> = { arrival: [], held: [], uninspected: [], review: [], archived: [] };
    let checking = 0;
    for (const f of onLane) {
      const sec = securityOf(f.fileId, f.s3Key);
      if (uploadState(f) === "stored" && (sec.k === "idle" || sec.k === "loading")) checking++;
      groups[lanePosition(f, sec)].push(f);
    }
    return { groups, checking };
  }, [onLane, securityOf]);

  const focus = live.find((f) => f.fileId === focusId) ?? onLane[0] ?? null;
  const deniedThisWeek = useMemo(() => deniedWithin(scoped, 7), [scoped]);
  const myAwaiting = useMemo(() => files.filter((f) => f.uploadedBy === email && uploadState(f) === "awaiting"), [files, email]);

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
  const loading = canBrowse ? filesLoading : auditLoading;

  const narrative = canBrowse
    ? [
        stored.length === 0 ? "The archive is ready for its first document." : `${plural(stored.length, "document")} in private storage.`,
        board.groups.arrival.length > 0 && `${plural(board.groups.arrival.length, "arrival")} awaiting S3.`,
        board.groups.review.length > 0 && `${board.groups.review.length} flagged for review.`,
        held.length > 0 && `${held.length} held, never received.`,
      ]
    : [`${plural(scoped.length, "recorded event")}.`, deniedThisWeek.length > 0 && `${plural(deniedThisWeek.length, "denied attempt")} this week.`];

  return (
    <div className="relative min-h-full" {...dropProps}>
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-40 flex animate-fade-in items-center justify-center bg-background/75 p-6">
          <div className="plate-raised flex flex-col items-center rounded-2xl px-10 py-8 text-center">
            <ArrowUpFromLine className="mb-3 size-6 text-primary-hi" />
            <p className="text-[15px] font-medium">Drop to check in</p>
            <p className="mt-1 text-[12.5px] text-ink-3">You&apos;ll declare its privacy level next</p>
          </div>
        </div>
      )}

      {/* ── Hero ─────────────────────────────────────────── */}
      <section aria-labelledby="lane-title" className="relative overflow-hidden border-b border-line">
        <div aria-hidden className="sv-grid pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,#000,transparent_85%)]" />
        <div className="relative mx-auto w-full max-w-[1440px] px-4 pb-6 pt-7 sm:px-6 lg:pb-8 lg:pt-9">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div className="min-w-0 animate-rise">
              <p className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-3">
                <span>{today}</span>
                <span aria-hidden className="size-1 rounded-full bg-ink-3/60" />
                <span>
                  {greeting()}, <span className="capitalize text-ink-2">{displayName}</span>
                </span>
              </p>
              <h1 id="lane-title" className="mt-2 text-[30px] font-semibold leading-[1.05] tracking-[-0.035em] text-foreground sm:text-[40px]">
                Inspection Lane
              </h1>
              {loading ? (
                <Skeleton className="mt-3 h-4 w-80 max-w-full" />
              ) : (
                <p className="mt-2.5 max-w-xl text-[14px] leading-relaxed text-ink-2">
                  {narrative.filter(Boolean).join(" ")} <span className="text-ink-3">Signed in as {role}.</span>
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canBrowse ? (
                <>
                  <ButtonLink href="/upload" variant="primary" size="lg">
                    <ArrowUpFromLine /> Check in a document
                  </ButtonLink>
                  <ButtonLink href="/files" variant="secondary" size="lg">
                    Open archive
                  </ButtonLink>
                </>
              ) : (
                <ButtonLink href="/audit-logs" variant="primary" size="lg">
                  <Link2 /> Open the chain
                </ButtonLink>
              )}
            </div>
          </div>

          {canBrowse && (
            <div className="mt-7">
              {filesError && files.length === 0 ? (
                <Notice tone="danger" icon={<CircleAlert />}>
                  {filesError}
                </Notice>
              ) : filesLoading ? (
                <div className="grid gap-3 md:grid-cols-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-[168px] rounded-2xl" />
                  ))}
                </div>
              ) : (
                <LaneBoard groups={board.groups} checking={board.checking} focusId={focus?.fileId} onFocus={setFocusId} />
              )}
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto w-full max-w-[1440px] space-y-8 px-4 py-7 sm:px-6">
        {/* ── Focused document ─────────────────────────── */}
        {canBrowse && !filesLoading && (
          focus ? (
            <FocusPanel file={focus} />
          ) : (
            <EmptyState
              icon={<ScanLine />}
              title="Nothing on the lane yet"
              className="plate rounded-2xl"
              action={
                <ButtonLink href="/upload" variant="primary" size="sm">
                  Check in your first document
                </ButtonLink>
              }
            >
              Documents appear here from the moment they&apos;re checked in.
            </EmptyState>
          )
        )}

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* ── Chain excerpt ─────────────────────────── */}
          <section aria-labelledby="chain-title" className="reveal min-w-0">
            <div className="mb-3 flex items-end justify-between">
              <div>
                <p className="eyebrow">Chain of inspection</p>
                <h2 id="chain-title" className="mt-1 text-[18px] font-semibold tracking-[-0.02em]">
                  {role === "User" ? "Your recent activity" : "Recent activity"}
                </h2>
              </div>
              <Link href="/audit-logs" className="flex items-center gap-1 text-[12.5px] font-medium text-ink-3 transition-colors hover:text-foreground">
                Full chain <ArrowRight className="size-3.5" />
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
              <p className="plate rounded-2xl px-4 py-5 text-[13px] text-ink-3">Nothing recorded yet. Downloads, denied downloads and lifecycle changes appear here.</p>
            ) : (
              <ol className="plate divide-y divide-line rounded-2xl px-2">
                {scoped.slice(0, canBrowse ? 7 : 14).map((e) => (
                  <ActivityLine key={e.auditId} event={e} me={email} linkFiles={canBrowse && hasRealFile(e)} />
                ))}
              </ol>
            )}
          </section>

          {/* ── Signals ───────────────────────────────── */}
          <section aria-labelledby="signals-title" className="reveal">
            <p className="eyebrow">Signals</p>
            <h2 id="signals-title" className="mb-3 mt-1 text-[18px] font-semibold tracking-[-0.02em]">
              Needs attention
            </h2>
            <ul className="space-y-2">
              {canBrowse && board.groups.review.length > 0 && (
                <Signal tone="warning" icon={<FileWarning />} href="/files" title={`${board.groups.review.length} flagged for review`}>
                  Personal data found, review required, or a declared level below the recommendation.
                </Signal>
              )}
              {canBrowse && myAwaiting.length > 0 && (
                <Signal tone="info" href="/files" title={`${plural(myAwaiting.length, "upload")} of yours awaiting S3`}>
                  Not yet confirmed as stored.
                </Signal>
              )}
              {canBrowse && held.length > 0 && (
                <Signal tone="warning" icon={<CircleSlash />} href="/files" title={`${held.length} held, never received`}>
                  S3 never confirmed these uploads. The owner or an Admin can re-check them in.
                </Signal>
              )}
              {deniedThisWeek.length > 0 && (
                <Signal tone="danger" icon={<ShieldX />} href="/audit-logs?result=denied" title={`${plural(deniedThisWeek.length, "denied attempt")} this week`}>
                  {role === "User" ? "Recorded against your account." : "Recorded in the audit log."}
                </Signal>
              )}
              {!(canBrowse && (board.groups.review.length || myAwaiting.length || held.length)) && deniedThisWeek.length === 0 && (
                <li className="plate rounded-2xl px-4 py-4 text-[13px] leading-relaxed text-ink-3">
                  No flagged documents, nothing awaiting S3{canBrowse ? " from you" : ""}, and no denied attempts this week.
                </li>
              )}
            </ul>

            <div className="mt-5 rounded-2xl border border-dashed border-line p-4">
              <p className="eyebrow mb-2">Not performed by this vault</p>
              <ul className="space-y-1.5 text-[12px] text-ink-3">
                {UNSUPPORTED_CHECKS.map((c) => (
                  <li key={c.label}>
                    <span className="text-ink-2">{c.label}.</span> {c.detail}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/* ── Facility board ────────────────────────────────────────────────── */

function LaneBoard({
  groups,
  checking,
  focusId,
  onFocus,
}: {
  groups: Record<LanePosition, VaultFile[]>;
  checking: number;
  focusId?: string;
  onFocus: (id: string) => void;
}) {
  const total = LANE_POSITIONS.reduce((n, p) => n + groups[p.key].length, 0);
  return (
    <div className="plate-raised relative overflow-hidden rounded-[22px]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
        <p className="flex items-center gap-2 text-[12.5px] text-ink-2">
          <ScanLine className="size-4 text-primary-hi" aria-hidden />
          <span className="font-medium text-foreground">{plural(total, "document")}</span> on the lane
        </p>
        <p className="text-[11.5px] text-ink-3" aria-live="polite">
          {checking > 0 ? `Reading inspection records for ${checking}…` : "Placed from real storage and inspection records"}
        </p>
      </div>

      <ol className="relative grid md:grid-cols-4" aria-label="Lane checkpoints">
        {/* The rail across all checkpoints (desktop) */}
        <span aria-hidden className="absolute left-[12.5%] right-[12.5%] top-[37px] hidden h-px bg-[linear-gradient(90deg,var(--color-primary),color-mix(in_oklab,var(--color-primary)_40%,var(--color-titanium)),var(--color-success))] opacity-60 md:block" />
        {LANE_POSITIONS.map((p, i) => {
          const items = groups[p.key];
          return (
            <li key={p.key} className={cn("relative px-4 pb-4 pt-5 sm:px-5", i > 0 && "border-t border-line md:border-l md:border-t-0")}>
              <div className="flex items-center gap-3 md:flex-col md:text-center">
                <span
                  className="relative z-10 flex size-[30px] shrink-0 items-center justify-center rounded-full border bg-surface-2 font-mono text-[12px] font-semibold"
                  style={{ borderColor: `color-mix(in oklab, var(--color-${toneColor(p.tone)}) 55%, transparent)`, color: `var(--color-${toneColor(p.tone)})` } as CSSProperties}
                >
                  {items.length}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-foreground">{p.label}</p>
                  <p className="text-[11.5px] text-ink-3">{p.caption}</p>
                </div>
              </div>
              <ul className="mt-3.5 space-y-1.5">
                {items.slice(0, 4).map((f) => (
                  <li key={f.fileId}>
                    <button
                      type="button"
                      onClick={() => onFocus(f.fileId)}
                      aria-pressed={focusId === f.fileId}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-[background-color,border-color] duration-150",
                        focusId === f.fileId ? "border-primary/45 bg-primary/[0.08]" : "border-line bg-surface-1/70 hover:border-line-strong hover:bg-tint/[0.03]",
                      )}
                    >
                      <span aria-hidden className="h-6 w-[3px] shrink-0 rounded-full" style={{ background: classificationHex[f.classification] }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-medium text-foreground">{f.fileName}</span>
                        <span className="block truncate text-[11px] text-ink-3">
                          {f.classification} · {formatFinderDate(f.uploadedAt || f.createdAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
                {items.length > 4 && (
                  <li>
                    <Link href="/files" className="block px-2.5 py-1 text-[11.5px] font-medium text-ink-3 hover:text-foreground">
                      +{items.length - 4} more in the archive
                    </Link>
                  </li>
                )}
                {items.length === 0 && <li className="rounded-xl border border-dashed border-line px-2.5 py-2.5 text-[11.5px] text-ink-3">None at this checkpoint</li>}
              </ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const toneColor = (t: string) => (t === "info" ? "primary" : t === "muted" ? "titanium" : t === "neutral" ? "ink-2" : t);

/* ── One document's lane ───────────────────────────────────────────── */

function FocusPanel({ file }: { file: VaultFile }) {
  const stored = uploadState(file) === "stored";
  const { state: security } = useSecurity(file.fileId, file.s3Key, stored);
  const scan = useScan(file.fileId, file.s3Key);
  const stages = inspectionLane({ file, security, scan });
  const tint = classificationHex[file.classification];

  return (
    <section aria-labelledby="focus-title" className="plate relative overflow-hidden rounded-[22px]">
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(60% 120% at 0% 0%, ${alpha(tint, 10)}, transparent 60%)` }} />
      <div className="relative flex flex-wrap items-start justify-between gap-4 border-b border-line px-4 py-4 sm:px-6">
        <div className="flex min-w-0 items-start gap-3.5">
          <FileGlyph name={file.fileName} contentType={file.contentType} size="lg" />
          <div className="min-w-0">
            <p className="eyebrow">At the lane</p>
            <h2 id="focus-title" className="mt-0.5 break-words text-[16px] font-semibold tracking-[-0.01em] text-foreground">
              {file.fileName}
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-3">
              <span className="font-mono tracking-wide">{shortId(file.fileId)}</span>
              <span aria-hidden>·</span>
              {formatBytes(file.objectSize)}
              <span aria-hidden>·</span>
              {file.uploadedBy || "Owner not recorded"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ClassificationTag level={file.classification} />
          <ButtonLink href={`/files?doc=${encodeURIComponent(file.fileId)}`} size="sm" variant="secondary">
            Open passport <ArrowRight />
          </ButtonLink>
        </div>
      </div>
      <div className="relative px-4 py-5 sm:px-6">
        <InspectionLane key={file.fileId} stages={stages} className="animate-fade-in" />
      </div>
    </section>
  );
}

function Signal({
  tone,
  icon,
  href,
  title,
  children,
}: {
  tone: "info" | "warning" | "danger";
  icon?: React.ReactNode;
  href: string;
  title: string;
  children: React.ReactNode;
}) {
  const cls = { info: "border-primary/25 hover:bg-primary/[0.06]", warning: "border-warning/30 hover:bg-warning/[0.06]", danger: "border-danger/30 hover:bg-danger/[0.06]" }[tone];
  const txt = { info: "text-primary-hi", warning: "text-warning", danger: "text-danger" }[tone];
  return (
    <li>
      <Link href={href} className={cn("flex items-start gap-3 rounded-2xl border bg-surface-1 p-4 text-[12.5px] transition-colors", cls)}>
        <span className={cn("mt-0.5 shrink-0 [&_svg]:size-4", txt)} aria-hidden>
          {icon ?? <span className={cn("mt-1 block size-2 rounded-full", toneDot[tone])} />}
        </span>
        <span className="text-ink-3">
          <span className="block text-[13px] font-medium text-foreground">{title}</span>
          {children}
        </span>
      </Link>
    </li>
  );
}


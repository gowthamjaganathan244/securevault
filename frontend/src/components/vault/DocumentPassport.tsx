"use client";

import Link from "next/link";
import { useId, useRef, useState, type ReactNode } from "react";
import {
  ArrowDownToLine,
  Check,
  CircleCheck,
  CircleSlash,
  Clock,
  Copy,
  FilePen,
  Link2,
  Loader2,
  Maximize2,
  Replace,
  RotateCw,
  ShieldX,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/session";
import { useAudit } from "@/lib/store";
import { useMacie, useScan, useSecurity } from "@/lib/security";
import { inspectionLane } from "@/lib/inspection";
import { formatBytes, formatFinderDate, formatFull, relativeTime } from "@/lib/format";
import {
  canDownload,
  canManage,
  classificationCopy,
  describeAction,
  fileExtension,
  fileKind,
  isDenied,
  isIncomplete,
  kindLabel,
  scopeEvents,
  uploadState,
  uploadStateCopy,
} from "@/lib/vault";
import type { VaultFile } from "@/lib/types";
import { integrations } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { DataRow, Skeleton, StatusPill } from "@/components/ui/primitives";
import { PendingBadge } from "@/components/ui/Dialog";
import { InspectionLane, toneText } from "@/components/inspection/Lane";
import { InspectionEvidence } from "@/components/inspection/Evidence";
import { ClassificationTag, FileGlyph, UploadStatus, alpha, classificationHex, classificationTier } from "./tags";
import { useDownload } from "./useDownload";
import { useDocumentActions } from "./DocumentActions";
import { VersionHistory } from "./VersionHistory";

type Tab = "overview" | "evidence" | "clearance" | "history";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "evidence", label: "Evidence" },
  { key: "clearance", label: "Clearance" },
  { key: "history", label: "History" },
];

/** Two 44-character machine-readable lines built only from the record's real fields. Decorative (aria-hidden). */
function machineZone(file: VaultFile) {
  const clean = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, "<");
  const pad = (s: string, n: number) => (s + "<".repeat(n)).slice(0, n);
  const d = new Date(file.uploadedAt || file.createdAt || "");
  const ymd = Number.isNaN(d.getTime()) ? "000000" : d.toISOString().slice(2, 10).replace(/-/g, "");
  const base = file.fileName.replace(/\.[^.]+$/, "");
  return [
    pad(`SV<${file.classification.toUpperCase().slice(0, 4)}<<${clean(base)}`, 44),
    pad(`${file.fileId.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 24)}<${ymd}<T${classificationTier[file.classification]}<${(fileExtension(file.fileName) || "BIN").toUpperCase()}`, 44),
  ];
}

export function DocumentPassport({
  file,
  onClose,
  variant = "panel",
}: {
  file: VaultFile;
  onClose?: () => void;
  /** "panel": side panel or sheet; "page": the full /files/[id] page. */
  variant?: "panel" | "page";
}) {
  const { role, email } = useSession();
  const { download, busyId } = useDownload();
  const actions = useDocumentActions();
  const [tab, setTab] = useState<Tab>("overview");
  const [copied, setCopied] = useState<"id" | "link" | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const uid = useId();

  const state = uploadState(file);
  const stored = state === "stored";
  const { state: security } = useSecurity(file.fileId, file.s3Key, stored);
  const { state: macie } = useMacie(file.fileId, file.s3Key, stored);
  const scan = useScan(file.fileId, file.s3Key);
  const stages = inspectionLane({ file, security, scan, macie });
  const inspection = stages.find((s) => s.key === "inspection")!;
  const disposition = stages[stages.length - 1];

  const downloadAllowed = canDownload(role);
  const downloadable = downloadAllowed && stored;
  const isOwner = !!email && file.uploadedBy === email;
  const manage = canManage(file, role, email);
  const canRetry = downloadAllowed && state === "not-received" && manage;
  const tint = classificationHex[file.classification];
  const mrz = machineZone(file);

  const copy = async (what: "id" | "link") => {
    const text = what === "id" ? file.fileId : `${window.location.origin}/files/${file.fileId}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const n = (next + TABS.length) % TABS.length;
    setTab(TABS[n].key);
    tabRefs.current[n]?.focus();
  };

  return (
    <article aria-label={`Document passport: ${file.fileName}`} className="flex min-h-full flex-col">
      {/* ── Cover ─────────────────────────────────────── */}
      <header className="relative overflow-hidden px-5 pb-4 pt-5">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(110% 90% at 0% 0%, ${alpha(tint, 16)}, transparent 62%)` }} />
        <div aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: tint }} />

        <div className="relative flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3">
            Document passport
            <span className="text-ink-3/60">·</span>
            <span style={{ color: tint }}>Tier {classificationTier[file.classification]}</span>
          </p>
          {variant === "panel" && (
            <div className="-mr-1.5 flex shrink-0 items-center">
              <Link
                href={`/files/${encodeURIComponent(file.fileId)}`}
                aria-label="Open full passport"
                title="Open full passport"
                className="rounded-md p-1.5 text-ink-3 transition-colors hover:bg-tint/[0.06] hover:text-foreground"
              >
                <Maximize2 className="size-3.5" />
              </Link>
              {onClose && (
                <button onClick={onClose} aria-label="Close passport" title="Close (Esc)" className="rounded-md p-1.5 text-ink-3 transition-colors hover:bg-tint/[0.06] hover:text-foreground">
                  <X className="size-4" />
                </button>
              )}
            </div>
          )}
        </div>

        <div className="relative mt-4 flex items-start gap-4">
          <div className="plate-raised flex h-[76px] w-[62px] shrink-0 items-center justify-center rounded-xl">
            <FileGlyph name={file.fileName} contentType={file.contentType} size="lg" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="break-words text-[17px] font-semibold leading-snug tracking-[-0.015em] text-foreground">{file.fileName}</h2>
            <p className="mt-1 text-[12.5px] text-ink-3">
              {kindLabel[fileKind(file.fileName, file.contentType)]} · {formatBytes(file.objectSize)}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <ClassificationTag level={file.classification} />
              <UploadStatus state={state} />
              {isOwner && <StatusPill tone="neutral">You own this</StatusPill>}
            </div>
          </div>
        </div>

        {/* Machine-readable zone */}
        <div aria-hidden className="relative mt-4 rounded-lg border border-line bg-background/40 px-3 py-2">
          <p className="mrz">{mrz[0]}</p>
          <p className="mrz">{mrz[1]}</p>
        </div>

        {/* Primary actions */}
        <div className="relative mt-4 flex gap-2">
          {canRetry ? (
            <Button variant="primary" className="flex-1" onClick={() => actions.retry(file)} title="Check this document in again to create a verified copy">
              <RotateCw /> Re-check in
            </Button>
          ) : downloadAllowed ? (
            <Button
              variant="primary"
              className="flex-1"
              disabled={!downloadable || busyId === file.fileId}
              onClick={() => download(file)}
              title={downloadable ? "Request a short-lived signed link" : "Available once S3 confirms the file"}
            >
              {busyId === file.fileId ? <Loader2 className="animate-spin" /> : <ArrowDownToLine />}
              {busyId === file.fileId ? "Requesting link…" : "Secure view / download"}
            </Button>
          ) : (
            <div className="flex h-8 flex-1 items-center gap-2 rounded-[10px] border border-line bg-tint/[0.03] px-3 text-[12.5px] text-ink-3">
              <CircleSlash className="size-3.5" /> Auditors can&apos;t download files
            </div>
          )}
          <Button variant="secondary" size="icon" aria-label="Copy document ID" title="Copy document ID" onClick={() => copy("id")}>
            {copied === "id" ? <Check className="text-success" /> : <Copy />}
          </Button>
          <Button variant="secondary" size="icon" aria-label="Copy passport link" title="Copy link to this passport (sign-in required)" onClick={() => copy("link")}>
            {copied === "link" ? <Check className="text-success" /> : <Link2 />}
          </Button>
        </div>
        {downloadAllowed && state === "awaiting" && <p className="relative mt-2 text-[12px] text-ink-3">Download unlocks once S3 confirms the file.</p>}
      </header>

      {/* ── Tabs ──────────────────────────────────────── */}
      <div role="tablist" aria-label="Passport sections" className="sticky top-0 z-10 flex gap-1 border-y border-line bg-surface-1/95 px-3 backdrop-blur">
        {TABS.map((t, i) => (
          <button
            key={t.key}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${uid}-tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`${uid}-panel-${t.key}`}
            tabIndex={tab === t.key ? 0 : -1}
            onClick={() => setTab(t.key)}
            onKeyDown={(e) => onTabKey(e, i)}
            className={cn(
              "relative h-10 px-2.5 text-[12.5px] font-medium transition-colors",
              tab === t.key ? "text-foreground" : "text-ink-3 hover:text-foreground",
            )}
          >
            {t.label}
            {tab === t.key && <span aria-hidden className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`${uid}-panel-${tab}`} aria-labelledby={`${uid}-tab-${tab}`} className="flex-1 px-5 py-4">
        <div key={tab} className="animate-fade-in">
          {tab === "overview" && (
            <div className="space-y-5">
              <dl className="divide-y divide-line">
                <DataRow label="Document ID" mono>
                  {file.fileId}
                </DataRow>
                <DataRow label="Owner">{file.uploadedBy === email ? `You (${email})` : file.uploadedBy || "Not recorded"}</DataRow>
                <DataRow label="File type" mono>
                  {file.contentType || "Not recorded"}
                </DataRow>
                <DataRow label="Checked in">
                  <time dateTime={file.createdAt} title={formatFull(file.createdAt)}>
                    {formatFinderDate(file.createdAt)}
                  </time>
                </DataRow>
                <DataRow label="Storage">
                  <span title={uploadStateCopy[state].detail}>{uploadStateCopy[state].label}</span>
                  {file.uploadedAt && <span className="text-ink-3"> · {formatFinderDate(file.uploadedAt)}</span>}
                </DataRow>
                <DataRow label="Inspection">
                  <span className={toneText[inspection.tone]}>{inspection.headline}</span>
                </DataRow>
                <DataRow label="Disposition">
                  <span className={toneText[disposition.tone]}>{disposition.headline}</span>
                </DataRow>
                <DataRow label="Privacy">
                  <span className="text-foreground">{file.classification}</span>
                  <span className="text-ink-3"> · {classificationCopy[file.classification]?.summary}</span>
                </DataRow>
                {file.auditNote && <DataRow label="Record note">{file.auditNote}</DataRow>}
              </dl>

              <section aria-labelledby={`${uid}-lane`}>
                <h3 id={`${uid}-lane`} className="eyebrow mb-3">
                  Inspection lane
                </h3>
                <InspectionLane stages={stages} layout={variant === "page" ? "responsive" : "vertical"} />
              </section>
            </div>
          )}

          {tab === "evidence" && <InspectionEvidence file={file} canEdit={manage} role={role} />}

          {tab === "clearance" && <Clearance file={file} manage={manage} isOwner={isOwner} />}

          {tab === "history" && (
            <div className="space-y-6">
              <section>
                <h3 className="eyebrow mb-2.5">Version history</h3>
                {stored ? <VersionHistory key={`${file.fileId}:${file.s3Key}`} fileId={file.fileId} /> : <p className="text-[12.5px] text-ink-3">Available once S3 confirms the file.</p>}
              </section>
              <section>
                <h3 className="eyebrow mb-2.5">Chain of inspection</h3>
                <DocumentChain file={file} limit={variant === "page" ? 50 : 12} />
              </section>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

/* ── Clearance: who may do what with this document ─────────────────── */

function Clearance({ file, manage, isOwner }: { file: VaultFile; manage: boolean; isOwner: boolean }) {
  const { role } = useSession();
  const actions = useDocumentActions();
  const state = uploadState(file);
  const downloadAllowed = canDownload(role);
  const rules: { ok: boolean; label: string; why: string }[] = [
    { ok: true, label: "View this passport", why: "Any signed-in role can open a passport it can find." },
    {
      ok: downloadAllowed,
      label: "Secure view / download",
      why: downloadAllowed ? "Granted per request with a short-lived signed link. The server checks your role and records the attempt." : "Refused for the Auditor role. Attempts are still recorded.",
    },
    { ok: manage, label: "Replace, edit or delete", why: manage ? (role === "Admin" ? "Admins can manage any document." : "You own this document.") : "Only an Admin or the document's owner." },
    { ok: role === "Admin", label: "Lower the privacy level", why: role === "Admin" ? "Admins may lower a level. The change is audited." : "Only Admins can lower a level. Owners can raise it." },
    {
      ok: role === "Admin" || role === "Auditor",
      label: "See everyone's activity on it",
      why: role === "User" ? "Users see their own recorded activity only." : "Your role sees all recorded activity.",
    },
  ];
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-line bg-surface-2/60 p-3.5 text-[12.5px]">
        <p className="text-ink-2">
          Signed in as <span className="font-medium text-foreground">{role}</span>
          {isOwner ? " and the owner of this document." : file.uploadedBy ? `. Owner: ${file.uploadedBy}.` : ". The owner isn't recorded."}
        </p>
        <p className="mt-1 text-[11.5px] text-ink-3">These rules shape the interface. The vault API enforces them on every request and is the authority.</p>
      </div>

      <ul className="space-y-2.5">
        {rules.map((r) => (
          <li key={r.label} className="flex items-start gap-2.5 text-[12.5px]">
            <span className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full [&_svg]:size-2.5", r.ok ? "bg-success/15 text-success" : "bg-tint/[0.06] text-ink-3")}>
              {r.ok ? <Check strokeWidth={3} /> : <CircleSlash />}
            </span>
            <span>
              <span className={cn("font-medium", r.ok ? "text-foreground" : "text-ink-3")}>
                <span className="sr-only">{r.ok ? "Allowed: " : "Not allowed: "}</span>
                {r.label}
              </span>
              <span className="block text-ink-3">{r.why}</span>
            </span>
          </li>
        ))}
      </ul>

      <section>
        <h3 className="eyebrow mb-2.5">Actions available to you</h3>
        {manage ? (
          <div className="grid grid-cols-2 gap-1.5">
            <ActionTile
              icon={<Replace />}
              label="Replace file"
              hint={state === "stored" ? "Keeps ID & history" : "After S3 confirms"}
              pending={!integrations.replaceFile}
              disabled={state !== "stored"}
              onClick={() => actions.open("replace", file)}
            />
            <ActionTile icon={<FilePen />} label="Edit details" hint="Privacy level & note" pending={!integrations.updateMetadata} onClick={() => actions.open("edit", file)} />
            <ActionTile
              icon={<RotateCw />}
              label="Re-check in"
              hint={state === "not-received" ? "Creates a new record" : "Only for unfinished uploads"}
              disabled={state !== "not-received"}
              onClick={() => actions.retry(file)}
            />
            <ActionTile icon={<Trash2 />} label="Delete" hint="From the active vault" danger pending={!integrations.deleteFile} onClick={() => actions.open("delete", file)} />
          </div>
        ) : (
          <p className="text-[12.5px] text-ink-3">No management actions. Only an Admin or the document&apos;s owner can replace, edit or delete it.</p>
        )}
      </section>
    </div>
  );
}

function ActionTile({
  icon,
  label,
  hint,
  onClick,
  danger,
  pending,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
  danger?: boolean;
  pending?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-h-[58px] flex-col items-start justify-center gap-0.5 rounded-xl border px-3 py-2 text-left transition-[background-color,border-color] duration-[140ms] disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:size-3.5",
        danger ? "border-danger/30 bg-danger/[0.05] hover:bg-danger/[0.1]" : "border-line bg-tint/[0.02] hover:border-line-strong hover:bg-tint/[0.05]",
      )}
    >
      <span className={cn("flex w-full items-center gap-1.5 text-[12.5px] font-medium", danger ? "text-danger" : "text-foreground")}>
        {icon}
        <span className="flex-1">{label}</span>
        {pending && <PendingBadge />}
      </span>
      <span className="text-[11px] text-ink-3">{hint}</span>
    </button>
  );
}

/* ── This document's recorded activity ─────────────────────────────── */

function DocumentChain({ file, limit }: { file: VaultFile; limit: number }) {
  const { role, email } = useSession();
  const { events, loading } = useAudit();
  const history = scopeEvents(events, role, email).filter((e) => e.fileId === file.fileId);

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  }
  if (history.length === 0) {
    return (
      <p className="text-[12.5px] text-ink-3">
        Nothing recorded for this document{role === "User" ? " by you" : ""}. The audit log records downloads, denied downloads and lifecycle changes.
      </p>
    );
  }
  return (
    <ol className="relative space-y-3.5 before:absolute before:bottom-1 before:left-[7px] before:top-1 before:w-px before:bg-line">
      {history.slice(0, limit).map((e) => {
        const denied = isDenied(e);
        const incomplete = isIncomplete(e);
        return (
          <li key={e.auditId} className="relative flex gap-3">
            <span
              className={cn(
                "relative z-10 mt-0.5 flex size-[15px] shrink-0 items-center justify-center rounded-full ring-4 ring-surface-1",
                denied ? "bg-danger/20 text-danger" : incomplete ? "bg-warning/20 text-warning" : "bg-success/20 text-success",
              )}
            >
              {denied ? <ShieldX className="size-2.5" /> : incomplete ? <Clock className="size-2.5" /> : <CircleCheck className="size-2.5" />}
            </span>
            <div className="min-w-0 text-[12.5px]">
              <p className="text-ink-2">
                <span className="text-foreground">{e.userEmail === email ? "You" : e.userEmail}</span>
                {e.userRole && <span className="text-ink-3"> ({e.userRole})</span>} {describeAction(e).replace(/ of$/, "")}
              </p>
              {e.reason && <p className={denied ? "text-danger/90" : "text-ink-3"}>{e.reason}</p>}
              <time className="text-[11.5px] text-ink-3" dateTime={e.timestamp} title={formatFull(e.timestamp)}>
                {relativeTime(e.timestamp)} · <span className="font-mono">{e.auditId.slice(0, 12)}</span>
              </time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

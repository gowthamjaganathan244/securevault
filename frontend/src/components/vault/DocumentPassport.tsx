"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  ArrowDownToLine,
  Check,
  CircleCheck,
  CircleSlash,
  Copy,
  Link2,
  Loader2,
  RotateCw,
  Replace,
  FilePen,
  Trash2,
  Maximize2,
  ShieldCheck,
  ShieldX,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/session";
import { useAudit } from "@/lib/store";
import { formatBytes, formatFinderDate, formatFull, relativeTime } from "@/lib/format";
import {
  canDownload,
  canManage,
  classificationCopy,
  describeAction,
  fileKind,
  isDenied,
  kindLabel,
  scopeEvents,
  uploadState,
  uploadStateCopy,
} from "@/lib/vault";
import type { VaultFile } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/primitives";
import { ClassificationTag, FileGlyph, UploadStatus, classificationHex, classificationStyle } from "./tags";
import { useDownload } from "./useDownload";
import { useDocumentActions } from "./DocumentActions";
import { VersionHistory } from "./VersionHistory";
import { PrivacyReview } from "./PrivacyReview";
import { integrations } from "@/lib/api";
import { PendingBadge } from "@/components/ui/Dialog";

export function DocumentPassport({
  file,
  onClose,
  variant = "inspector",
}: {
  file: VaultFile;
  onClose?: () => void;
  variant?: "inspector" | "page";
}) {
  const { role, email } = useSession();
  const { events, loading: auditLoading } = useAudit();
  const { download, busyId } = useDownload();
  const [copied, setCopied] = useState<"id" | "link" | null>(null);

  const state = uploadState(file);
  const stateCopy = uploadStateCopy[state];
  const kind = fileKind(file.fileName, file.contentType);
  const cls = classificationCopy[file.classification] ?? classificationCopy.Internal;
  const history = scopeEvents(events, role, email).filter((e) => e.fileId === file.fileId);
  const downloadAllowed = canDownload(role);
  const downloadable = downloadAllowed && state === "stored";
  const isOwner = !!email && file.uploadedBy === email;
  // An upload S3 never confirmed can be retried by its owner or an Admin (creates a new verified record).
  const manage = canManage(file, role, email);
  const canRetry = downloadAllowed && state === "not-received" && manage;
  const actions = useDocumentActions();

  const copy = async (what: "id" | "link") => {
    const text = what === "id" ? file.fileId : `${window.location.origin}/files/${file.fileId}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      /* clipboard unavailable — nothing to do */
    }
  };

  return (
    <article aria-label={`Document passport: ${file.fileName}`} className="flex min-h-full flex-col">
      {/* Header */}
      <header className="relative px-5 pb-4 pt-5">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-28"
          style={{ background: `radial-gradient(120% 100% at 0% 0%, ${classificationHex[file.classification]}1f, transparent 70%)` }}
        />
        <div className="relative flex items-start gap-3.5">
          <FileGlyph name={file.fileName} contentType={file.contentType} size="lg" />
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Document passport</p>
            <h2 className="mt-0.5 break-words text-[16px] font-semibold leading-snug tracking-[-0.01em] text-foreground">
              {file.fileName}
            </h2>
            <p className="mt-1 text-[12.5px] text-ink-3">
              {kindLabel[kind]} · {formatBytes(file.objectSize)}
            </p>
          </div>
          {variant === "inspector" && (
            <div className="-mr-1.5 -mt-1 flex shrink-0 items-center">
              <Link
                href={`/files/${file.fileId}`}
                aria-label="Open full passport"
                title="Open full passport"
                className="rounded-md p-1.5 text-ink-3 transition-colors hover:bg-white/[0.06] hover:text-foreground"
              >
                <Maximize2 className="size-3.5" />
              </Link>
              {onClose && (
                <button
                  onClick={onClose}
                  aria-label="Close inspector"
                  title="Close (Esc)"
                  className="rounded-md p-1.5 text-ink-3 transition-colors hover:bg-white/[0.06] hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
          )}
        </div>

        <div className="relative mt-4 flex flex-wrap items-center gap-2">
          <ClassificationTag level={file.classification} />
          <span className="inline-flex h-5.5 items-center rounded-md border border-line bg-white/[0.03] px-2">
            <UploadStatus state={state} />
          </span>
          {isOwner && (
            <span className="inline-flex h-5.5 items-center rounded-md border border-line bg-white/[0.03] px-2 text-[11.5px] text-ink-2">
              You own this
            </span>
          )}
        </div>

        {/* Primary actions */}
        <div className="relative mt-4 flex gap-2">
          {canRetry ? (
            <Button
              variant="primary"
              className="flex-1"
              onClick={() => {
                actions.retry(file);
              }}
              title="Upload this document again to create a verified copy"
            >
              <RotateCw /> Re-upload
            </Button>
          ) : downloadAllowed ? (
            <Button
              variant="primary"
              className="flex-1"
              disabled={!downloadable || busyId === file.fileId}
              onClick={() => download(file)}
              title={downloadable ? "Request a short-lived download link" : "Available once S3 confirms the file"}
            >
              {busyId === file.fileId ? <Loader2 className="animate-spin" /> : <ArrowDownToLine />}
              {busyId === file.fileId ? "Requesting link…" : "View / Download"}
            </Button>
          ) : (
            <div className="flex h-8 flex-1 items-center gap-2 rounded-lg border border-line bg-white/[0.03] px-3 text-[12.5px] text-ink-3">
              <CircleSlash className="size-3.5" /> Auditors can&apos;t download files
            </div>
          )}
          <Button variant="secondary" size="icon" aria-label="Copy file ID" title="Copy file ID" onClick={() => copy("id")}>
            {copied === "id" ? <Check className="text-success" /> : <Copy />}
          </Button>
          <Button
            variant="secondary"
            size="icon"
            aria-label="Copy passport link"
            title="Copy link to this passport (sign-in required)"
            onClick={() => copy("link")}
          >
            {copied === "link" ? <Check className="text-success" /> : <Link2 />}
          </Button>
        </div>
        {downloadAllowed && state === "awaiting" && (
          <p className="relative mt-2 text-[12px] text-ink-3">Download unlocks once S3 confirms the file.</p>
        )}
      </header>

      <div className="flex-1 space-y-px border-t border-line">
        <Section title="Actions">
          {manage ? (
            <div className="grid grid-cols-2 gap-1.5">
              <ActionTile
                icon={<Replace />}
                label="Replace file"
                hint={state === "stored" ? "Keep ID & history" : "After S3 confirms"}
                pending={!integrations.replaceFile}
                disabled={state !== "stored"}
                onClick={() => actions.open("replace", file)}
              />
              <ActionTile icon={<FilePen />} label="Edit details" hint="Privacy level & note" pending={!integrations.updateMetadata} onClick={() => actions.open("edit", file)} />
              <ActionTile
                icon={<RotateCw />}
                label="Re-upload"
                hint={state === "not-received" ? "Creates a new record" : "Only for unfinished uploads"}
                disabled={state !== "not-received"}
                onClick={() => actions.retry(file)}
              />
              <ActionTile icon={<Trash2 />} label="Delete" hint="Permanent" danger pending={!integrations.deleteFile} onClick={() => actions.open("delete", file)} />
            </div>
          ) : (
            <p className="text-[12.5px] text-ink-3">
              Only an Admin or the document&apos;s owner can replace, edit or delete it. You&apos;re signed in as {role}.
            </p>
          )}
        </Section>

        <Section title="Storage">
          <p className="mb-3 flex items-start gap-2 text-[12.5px] text-ink-2">
            {state === "stored" ? (
              <ShieldCheck className="mt-px size-4 shrink-0 text-success" />
            ) : (
              <span className="mt-1 shrink-0">
                <UploadStatus state={state} withLabel={false} />
              </span>
            )}
            {stateCopy.detail}
          </p>
          <dl className="grid grid-cols-[112px_1fr] gap-x-3 gap-y-2 text-[12.5px]">
            <Field label="Owner">{file.uploadedBy || "Not recorded"}</Field>
            <Field label="Link issued">
              <time dateTime={file.createdAt} title={formatFull(file.createdAt)}>
                {formatFinderDate(file.createdAt)}
              </time>
            </Field>
            <Field label="S3 confirmed">
              {file.uploadedAt ? (
                <time dateTime={file.uploadedAt} title={formatFull(file.uploadedAt)}>
                  {formatFinderDate(file.uploadedAt)}
                </time>
              ) : (
                <span className="text-ink-3">Not yet</span>
              )}
            </Field>
            <Field label="Type">{file.contentType || "Not recorded"}</Field>
            <Field label="Size">
              {file.objectSize !== undefined ? `${formatBytes(file.objectSize)} (${file.objectSize.toLocaleString()} bytes)` : "Known after S3 confirms"}
            </Field>
            <Field label="File ID">
              <span className="break-all font-mono text-[11.5px] text-ink-2">{file.fileId}</span>
            </Field>
            {role === "Admin" && file.s3Key && (
              <Field label="Object key">
                <span className="break-all font-mono text-[11.5px] text-ink-2" title="Private object — not publicly reachable">
                  {file.s3Key}
                </span>
              </Field>
            )}
            {file.auditNote && <Field label="Upload note">{file.auditNote}</Field>}
          </dl>
        </Section>

        <Section title="Classification">
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border",
                classificationStyle[file.classification].bg,
                classificationStyle[file.classification].ring,
                classificationStyle[file.classification].text,
              )}
            >
              {(() => {
                const Icon = classificationStyle[file.classification].icon;
                return <Icon className="size-3.5" />;
              })()}
            </span>
            <div className="text-[12.5px]">
              <p className="font-medium text-foreground">
                {file.classification} — {cls.summary}
              </p>
              <p className="mt-0.5 text-ink-3">{cls.detail}</p>
            </div>
          </div>
        </Section>

        <Section title="Your access">
          <ul className="space-y-1.5 text-[12.5px]">
            <Allowed ok>View this passport</Allowed>
            <Allowed ok={downloadAllowed}>
              {downloadAllowed
                ? "Download — the server checks your role and records the attempt"
                : "Download — refused for the Auditor role"}
            </Allowed>
            <Allowed ok>
              {role === "Admin" || role === "Auditor" ? "See everyone's access history" : "See your own access history"}
            </Allowed>
          </ul>
          <p className="mt-2.5 text-[11.5px] text-ink-3">
            Signed in as <span className="text-ink-2">{role}</span>. The server checks every action against your signed-in role and records it
            in the audit log.
          </p>
        </Section>

        {state === "stored" && (
          <Section title="Privacy review">
            <PrivacyReview key={`${file.fileId}:${file.s3Key}`} fileId={file.fileId} classification={file.classification} canEdit={manage} uploadedAt={file.uploadedAt} />
          </Section>
        )}

        <Section title="Version history">
          {state === "stored" ? (
            <VersionHistory key={`${file.fileId}:${file.s3Key}`} fileId={file.fileId} />
          ) : (
            <p className="text-[12.5px] text-ink-3">Available once S3 confirms the file.</p>
          )}
        </Section>

        <Section title="Access history" last>
          {auditLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : history.length === 0 ? (
            <p className="text-[12.5px] text-ink-3">
              No access has been recorded for this document{role === "User" ? " by you" : ""}. The audit log records downloads and denied downloads.
            </p>
          ) : (
            <ol className="relative space-y-3 before:absolute before:bottom-1 before:left-[7px] before:top-1 before:w-px before:bg-line">
              {history.slice(0, variant === "page" ? 50 : 8).map((e) => {
                const denied = isDenied(e);
                return (
                  <li key={e.auditId} className="relative flex gap-3 pl-0">
                    <span
                      className={cn(
                        "relative z-10 mt-0.5 flex size-[15px] shrink-0 items-center justify-center rounded-full ring-4 ring-surface-1",
                        denied ? "bg-danger/20 text-danger" : "bg-success/20 text-success",
                      )}
                    >
                      {denied ? <ShieldX className="size-2.5" /> : <CircleCheck className="size-2.5" />}
                    </span>
                    <div className="min-w-0 text-[12.5px]">
                      <p className="text-ink-2">
                        <span className="text-foreground">{e.userEmail === email ? "You" : e.userEmail}</span>{" "}
                        <span className="text-ink-3">({e.userRole})</span> {describeAction(e).replace(/ of$/, "")}
                      </p>
                      {e.reason && <p className="text-ink-3">{e.reason}</p>}
                      <time className="text-[11.5px] text-ink-3" dateTime={e.timestamp} title={formatFull(e.timestamp)}>
                        {relativeTime(e.timestamp)}
                      </time>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Section>
      </div>
    </article>
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
        danger ? "border-danger/25 bg-danger/[0.05] hover:bg-danger/[0.1]" : "border-line bg-white/[0.02] hover:border-line-strong hover:bg-white/[0.05]",
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

function Section({ title, children, last }: { title: string; children: ReactNode; last?: boolean }) {
  return (
    <section className={cn("px-5 py-4", !last && "border-b border-line")}>
      <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-ink-3">{label}</dt>
      <dd className="min-w-0 text-ink-2">{children}</dd>
    </>
  );
}

function Allowed({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li className={cn("flex items-start gap-2", ok ? "text-ink-2" : "text-ink-3")}>
      <span className={cn("mt-px shrink-0 [&_svg]:size-3.5", ok ? "text-success" : "text-ink-3")}>{ok ? <Check /> : <CircleSlash />}</span>
      <span>
        <span className="sr-only">{ok ? "Allowed: " : "Not allowed: "}</span>
        {children}
      </span>
    </li>
  );
}

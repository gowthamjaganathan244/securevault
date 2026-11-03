"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowUp, ChevronDown, FilePen, Replace, Trash2, CircleAlert, CircleCheck, Clock, Download, History, Info, RotateCw, SearchX, ShieldX } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/session";
import { useAudit, useFiles } from "@/lib/store";
import { dayLabel, formatFull, formatTime, titleCase } from "@/lib/format";
import { describeAction, hasRealActor, hasRealFile, isDenied, isIncomplete, recordEvents, scopeEvents } from "@/lib/vault";
import type { AuditEvent } from "@/lib/types";
import { PageToolbar } from "@/components/shell/PageToolbar";
import { Button } from "@/components/ui/Button";
import { EmptyState, Notice, Panel, RowsSkeleton, SearchField, Segmented } from "@/components/ui/primitives";

type ResultFilter = "all" | "allowed" | "denied";
type ViewMode = "timeline" | "table";

export function ActivityView() {
  const { role, email } = useSession();
  const { events: auditEvents, loading: auditLoading, error, refresh, refreshing } = useAudit();
  const { files, loading: filesLoading } = useFiles();
  const loading = auditLoading || filesLoading;
  const params = useSearchParams();
  const oversight = role === "Admin" || role === "Auditor";

  const [query, setQuery] = useState(() => params.get("q") ?? "");
  const [result, setResult] = useState<ResultFilter>(() => {
    const r = params.get("result");
    return r === "denied" || r === "allowed" ? r : "all";
  });
  const [action, setAction] = useState("all");
  const [view, setView] = useState<ViewMode>("timeline");
  const [source, setSource] = useState<"all" | "audit" | "records">("all");

  // Access events from the audit log + upload events recorded on documents.
  const events = useMemo(
    () =>
      [...auditEvents.map((e) => ({ ...e, source: "audit" as const })), ...recordEvents(files)].sort(
        (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp),
      ),
    [auditEvents, files],
  );

  const scoped = useMemo(() => scopeEvents(events, role, email), [events, role, email]);
  const actions = useMemo(() => Array.from(new Set(scoped.map((e) => e.action))).sort(), [scoped]);

  const visible = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return scoped.filter((e) => {
      if (source !== "all" && e.source !== source) return false;
      if (result === "allowed" && (isDenied(e) || isIncomplete(e))) return false;
      if (result === "denied" && !isDenied(e)) return false;
      if (action !== "all" && e.action !== action) return false;
      if (terms.length) {
        const hay = `${e.userEmail} ${e.userRole} ${e.action} ${e.fileName ?? ""} ${e.reason ?? ""} ${e.result} ${e.fileId ?? ""}`.toLowerCase();
        if (!terms.every((t) => hay.includes(t))) return false;
      }
      return true;
    });
  }, [scoped, query, result, action, source]);

  const counts = useMemo(
    () => ({
      uploads: scoped.filter((e) => e.source === "records").length,
      allowed: scoped.filter((e) => e.source === "audit" && !isDenied(e)).length,
      denied: scoped.filter(isDenied).length,
    }),
    [scoped],
  );

  const exportCsv = () => {
    const header = ["timestamp", "source", "result", "action", "actor", "role", "file_name", "file_id", "reason", "audit_id"];
    const esc = (v: string | undefined) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const rows = visible.map((e) =>
      [e.timestamp, e.source === "records" ? "document record" : "audit log", e.result, e.action, e.userEmail, e.userRole, e.fileName, e.fileId, e.reason, e.auditId].map(esc).join(","),
    );
    const blob = new Blob([[header.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `securevault-activity-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-full">
      <PageToolbar
        title={oversight ? "Activity" : "Your activity"}
        subtitle={
          loading
            ? "Loading the audit log…"
            : `${visible.length} event${visible.length === 1 ? "" : "s"} · ${counts.uploads} uploads · ${counts.allowed} allowed · ${counts.denied} denied`
        }
        actions={
          <>
            {oversight && (
              <Segmented
                label="Layout"
                value={view}
                onChange={setView}
                options={[
                  { value: "timeline", label: "Timeline" },
                  { value: "table", label: "Table" },
                ]}
                className="max-sm:hidden"
              />
            )}
            {oversight && (
              <Button variant="ghost" size="icon" aria-label="Export CSV" title="Export the filtered events as CSV" onClick={exportCsv} disabled={!visible.length}>
                <Download />
              </Button>
            )}
            <Button variant="ghost" size="icon" aria-label="Refresh" title="Refresh" onClick={() => refresh()} disabled={refreshing}>
              <RotateCw className={cn(refreshing && "animate-spin")} />
            </Button>
          </>
        }
      >
        <SearchField
          label="Search activity"
          value={query}
          onChange={setQuery}
          placeholder={oversight ? "Search actor, document or reason" : "Search document or reason"}
          className="w-full sm:w-72"
        />
        <Segmented
          label="Source"
          size="sm"
          value={source}
          onChange={setSource}
          options={[
            { value: "all", label: "All sources" },
            { value: "audit", label: "Access log" },
            { value: "records", label: "Uploads" },
          ]}
        />
        <Segmented
          label="Result"
          size="sm"
          value={result}
          onChange={setResult}
          options={[
            { value: "all", label: "All" },
            {
              value: "allowed",
              label: (
                <>
                  <span className="size-1.5 rounded-full bg-success" aria-hidden /> Allowed
                </>
              ),
            },
            {
              value: "denied",
              label: (
                <>
                  <span className="size-1.5 rounded-full bg-danger" aria-hidden /> Denied
                </>
              ),
            },
          ]}
        />
        {actions.length > 1 && (
          <label className="relative">
            <span className="sr-only">Action</span>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="h-7 appearance-none rounded-lg border border-line bg-white/[0.03] pl-2.5 pr-7 text-[12px] font-medium text-ink-2 outline-none transition-colors hover:border-line-strong focus:border-primary/50 [&>option]:bg-surface-2"
            >
              <option value="all">All actions</option>
              {actions.map((a) => (
                <option key={a} value={a}>
                  {titleCase(a)}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2 text-ink-3" />
          </label>
        )}
      </PageToolbar>

      <div className="mx-auto w-full max-w-[980px] px-4 py-5 sm:px-6">
        {!loading && actions.length > 0 && (
          <p className="mb-4 flex items-start gap-2 text-[12px] leading-relaxed text-ink-3">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Access events come from the vault&apos;s audit log; uploads come from the timestamps recorded on each document
              {oversight ? "" : " (yours only)"}. Sign-ins aren&apos;t recorded.
              <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                {Object.entries(LIFECYCLE).map(([k, v]) => (
                  <span key={k} className="inline-flex items-center gap-1.5">
                    <span className={cn("flex size-4 items-center justify-center rounded-full", v.cls)} aria-hidden>
                      <v.icon className="size-2.5" />
                    </span>
                    {v.label}
                  </span>
                ))}
                <span className="text-ink-3">— shown here once the API records these events.</span>
              </span>
            </span>
          </p>
        )}

        {error && events.length === 0 ? (
          <Notice
            tone="danger"
            icon={<CircleAlert />}
            action={
              <Button size="sm" onClick={() => refresh()}>
                Try again
              </Button>
            }
          >
            {error}
          </Notice>
        ) : loading ? (
          <Panel>
            <RowsSkeleton rows={8} />
          </Panel>
        ) : scoped.length === 0 ? (
          <Panel>
            <EmptyState icon={<History />} title="No activity recorded yet">
              {oversight ? "Download attempts will appear here as they happen." : "Your downloads and denied attempts will appear here."}
            </EmptyState>
          </Panel>
        ) : visible.length === 0 ? (
          <Panel>
            <EmptyState
              icon={<SearchX />}
              title="No events match"
              action={
                <Button
                  size="sm"
                  onClick={() => {
                    setQuery("");
                    setResult("all");
                    setAction("all");
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          </Panel>
        ) : view === "table" && oversight ? (
          <AuditTable events={visible} />
        ) : (
          <Timeline events={visible} me={email} linkFiles={role !== "Auditor"} />
        )}
      </div>
    </div>
  );
}

function Timeline({ events, me, linkFiles }: { events: AuditEvent[]; me: string; linkFiles: boolean }) {
  const groups = useMemo(() => {
    const out: { label: string; items: AuditEvent[] }[] = [];
    for (const e of events) {
      const label = dayLabel(e.timestamp);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(e);
      else out.push({ label, items: [e] });
    }
    return out;
  }, [events]);

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.label} aria-label={g.label} className="reveal">
          <h2 className="mb-1 px-2 text-[12px] font-semibold text-ink-2">
            {g.label}
          </h2>
          <ol className="relative">
            {g.items.map((e) => (
              <ActivityLine key={e.auditId} event={e} me={me} linkFiles={linkFiles && hasRealFile(e)} expandable />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

/** Visual identity per event type — lifecycle events are ready for when the API records them. */
const LIFECYCLE: Record<string, { icon: typeof Trash2; cls: string; label: string }> = {
  FILE_DELETED: { icon: Trash2, cls: "bg-white/10 text-ink-2", label: "Deleted" },
  FILE_REPLACED: { icon: Replace, cls: "bg-primary/15 text-primary-hi", label: "Replaced" },
  METADATA_UPDATED: { icon: FilePen, cls: "bg-[#a78bfa]/15 text-[#c4b5fd]", label: "Details changed" },
};

/** One audit event as a sentence: actor · action · document, with the outcome as the node. */
export function ActivityLine({
  event,
  me,
  compact,
  linkFiles,
  expandable,
}: {
  event: AuditEvent;
  me: string;
  compact?: boolean;
  linkFiles?: boolean;
  expandable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const denied = isDenied(event);
  const incomplete = isIncomplete(event);
  const lifecycle = LIFECYCLE[event.action];
  const actor = !hasRealActor(event) ? "An unidentified request" : event.userEmail === me ? "You" : event.userEmail;
  const docName = hasRealFile(event) ? event.fileName || "a document" : "an unspecified document";

  const body = (
    <>
      <span
        className={cn(
          "relative z-10 mt-0.5 flex shrink-0 items-center justify-center rounded-full",
          compact ? "size-5" : "size-6",
          lifecycle ? lifecycle.cls : denied ? "bg-danger/15 text-danger" : incomplete ? "bg-warning/15 text-warning" : event.source === "records" ? "bg-primary/15 text-primary-hi" : "bg-success/15 text-success",
        )}
      >
        {lifecycle ? <lifecycle.icon className="size-3" /> : denied ? <ShieldX className="size-3" /> : incomplete ? <Clock className="size-3" /> : event.source === "records" ? <ArrowUp className="size-3" /> : <CircleCheck className="size-3" />}
        <span className="sr-only">{lifecycle ? lifecycle.label : denied ? "Denied" : incomplete ? "Incomplete" : event.source === "records" ? "Uploaded" : "Allowed"}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block leading-snug text-ink-2", compact ? "text-[12.5px]" : "text-[13.5px]")}>
          <span className="font-medium text-foreground">{actor}</span>
          {hasRealActor(event) && event.userRole && <span className="text-ink-3"> ({event.userRole})</span>} {describeAction(event)}{" "}
          {linkFiles && !expandable ? (
            <Link href={`/files?doc=${encodeURIComponent(event.fileId!)}`} className="text-foreground underline-offset-2 hover:underline">
              {docName}
            </Link>
          ) : (
            <span className="text-foreground">{docName}</span>
          )}
        </span>
        {event.reason && (!compact || denied) && (
          <span className={cn("mt-0.5 block text-[12px]", denied ? "text-danger/90" : incomplete ? "text-warning/90" : "text-ink-3")}>{event.reason}</span>
        )}
      </span>
      <time
        dateTime={event.timestamp}
        title={formatFull(event.timestamp)}
        className={cn("tabular shrink-0 pt-0.5 text-ink-3", compact ? "text-[11.5px]" : "text-[12px]")}
      >
        {compact && dayLabel(event.timestamp) !== "Today" ? shortDate(event.timestamp) : formatTime(event.timestamp)}
      </time>
    </>
  );

  if (!expandable) {
    return <li className={cn("flex items-start gap-2.5 rounded-lg", compact ? "px-1 py-1.5" : "px-2 py-2")}>{body}</li>;
  }

  return (
    <li className="group relative before:absolute before:bottom-0 before:left-[19px] before:top-0 before:w-px before:bg-line first:before:top-4 last:before:bottom-auto last:before:h-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left transition-colors duration-[120ms] hover:bg-white/[0.03]"
      >
        {body}
        <ChevronDown className={cn("mt-1 size-3.5 shrink-0 text-ink-3 transition-transform duration-[180ms]", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mb-2 ml-11 mr-2 animate-rise rounded-lg border border-line bg-surface-1 p-3">
          <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-1.5 text-[12px]">
            <dt className="text-ink-3">Recorded</dt>
            <dd className="text-ink-2">{formatFull(event.timestamp)}</dd>
            <dt className="text-ink-3">Result</dt>
            <dd className={denied ? "text-danger" : "text-success"}>{event.result}</dd>
            <dt className="text-ink-3">Action</dt>
            <dd className="font-mono text-[11.5px] text-ink-2">{event.action}</dd>
            <dt className="text-ink-3">Actor</dt>
            <dd className="break-all text-ink-2">
              {event.userEmail || "—"} · {event.userRole || "—"}
            </dd>
            <dt className="text-ink-3">Document</dt>
            <dd className="break-all text-ink-2">
              {linkFiles ? (
                <Link href={`/files?doc=${encodeURIComponent(event.fileId!)}`} className="text-primary-hi hover:text-white">
                  {event.fileName || event.fileId}
                </Link>
              ) : (
                event.fileName || "—"
              )}
            </dd>
            <dt className="text-ink-3">Source</dt>
            <dd className="text-ink-2">{event.source === "records" ? "Document record (DynamoDB metadata)" : "Audit log"}</dd>
            <dt className="text-ink-3">{event.source === "records" ? "Record" : "Audit ID"}</dt>
            <dd className="break-all font-mono text-[11.5px] text-ink-3">{event.auditId}</dd>
          </dl>
        </div>
      )}
    </li>
  );
}

function shortDate(ts: string) {
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(new Date(ts));
}

type SortKey = "timestamp" | "result" | "action" | "userEmail" | "userRole" | "fileName";

function AuditTable({ events }: { events: AuditEvent[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "timestamp", dir: -1 });
  const sorted = useMemo(
    () =>
      [...events].sort((a, b) => {
        const av = sort.key === "timestamp" ? Date.parse(a.timestamp) : (a[sort.key] ?? "").toString().toLowerCase();
        const bv = sort.key === "timestamp" ? Date.parse(b.timestamp) : (b[sort.key] ?? "").toString().toLowerCase();
        return (av < bv ? -1 : av > bv ? 1 : 0) * sort.dir;
      }),
    [events, sort],
  );
  const cols: { key: SortKey; label: string; className?: string }[] = [
    { key: "timestamp", label: "Time" },
    { key: "result", label: "Result" },
    { key: "action", label: "Action" },
    { key: "userEmail", label: "Actor" },
    { key: "userRole", label: "Role" },
    { key: "fileName", label: "Document" },
  ];
  return (
    <Panel className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-left text-[12.5px]">
        <thead>
          <tr className="border-b border-line text-[11.5px] text-ink-3">
            {cols.map((c) => (
              <th
                key={c.key}
                scope="col"
                aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
                className="px-3 py-2 font-medium"
              >
                <button
                  type="button"
                  onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : 1 }))}
                  className={cn("flex items-center gap-1 hover:text-foreground", sort.key === c.key && "text-ink-2")}
                >
                  {c.label}
                  {sort.key === c.key && <ChevronDown className={cn("size-3 transition-transform", sort.dir === 1 && "rotate-180")} />}
                </button>
              </th>
            ))}
            <th scope="col" className="px-3 py-2 font-medium">
              Reason
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {sorted.map((e) => {
            const denied = isDenied(e);
            return (
                <tr key={e.auditId} className="transition-colors hover:bg-white/[0.02]">
                  <td className="tabular whitespace-nowrap px-3 py-2 text-ink-2" title={formatFull(e.timestamp)}>
                    {formatFull(e.timestamp)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 font-medium",
                        denied ? "text-danger" : isIncomplete(e) ? "text-warning" : e.source === "records" ? "text-primary-hi" : "text-success",
                      )}
                    >
                      {denied ? <ShieldX className="size-3.5" /> : isIncomplete(e) ? <Clock className="size-3.5" /> : e.source === "records" ? <ArrowUp className="size-3.5" /> : <CircleCheck className="size-3.5" />}
                      {denied ? "Denied" : isIncomplete(e) ? "Incomplete" : e.source === "records" ? "Uploaded" : "Allowed"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-ink-2">{titleCase(e.action)}</td>
                  <td className="max-w-[220px] truncate px-3 py-2 text-foreground" title={e.userEmail}>
                    {e.userEmail}
                  </td>
                  <td className="px-3 py-2 text-ink-2">{e.userRole}</td>
                  <td className="max-w-[220px] truncate px-3 py-2 text-ink-2" title={e.fileName}>
                    {hasRealFile(e) ? e.fileName : "—"}
                  </td>
                  <td className="max-w-[240px] truncate px-3 py-2 text-ink-3" title={e.reason}>
                    {e.reason || "—"}
                  </td>
                </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

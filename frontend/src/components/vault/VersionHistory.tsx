"use client";

import { useEffect, useState } from "react";
import { ArrowDownToLine, CircleAlert, Loader2 } from "lucide-react";
import { getVersionDownloadUrl, getVersions, type FileVersion } from "@/lib/api";
import { formatBytes, formatFinderDate, formatFull } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

/** Live version list from GET /files/{id}/versions; previous versions download via their own presigned link. */
export function VersionHistory({ fileId, compact }: { fileId: string; compact?: boolean }) {
  const toast = useToast();
  const [state, setState] = useState<{ k: "loading" } | { k: "error"; message: string } | { k: "ok"; versions: FileVersion[] }>({ k: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    getVersions(fileId)
      .then((r) => alive && setState({ k: "ok", versions: r.versions ?? [] }))
      .catch((e: unknown) => alive && setState({ k: "error", message: e instanceof Error ? e.message : "Couldn't load versions." }));
    return () => {
      alive = false;
    };
  }, [fileId, attempt]);

  const download = async (v: FileVersion) => {
    setBusy(v.versionId);
    try {
      const url = await getVersionDownloadUrl(fileId, v.versionId);
      // Presigned S3 link: opened directly, never with Cognito headers.
      const w = window.open(url, "_blank");
      if (w) w.opener = null;
      else toast({ tone: "info", title: "Your version link is ready", action: { label: "Open download", onClick: () => window.open(url, "_blank", "noopener,noreferrer") } });
    } catch (e) {
      toast({ tone: "danger", title: "Version download failed", body: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  if (state.k === "loading") {
    return (
      <p className="flex items-center gap-2 text-[12px] text-ink-3" role="status">
        <Loader2 className="size-3.5 animate-spin" /> Loading versions…
      </p>
    );
  }
  if (state.k === "error") {
    return (
      <div className="flex items-start gap-2 text-[12px] text-danger">
        <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
        <span className="flex-1">{state.message}</span>
        <button
          type="button"
          onClick={() => {
            setState({ k: "loading" });
            setAttempt((a) => a + 1);
          }}
          className="font-medium text-primary-hi hover:text-white"
        >
          Retry
        </button>
      </div>
    );
  }
  if (state.versions.length === 0) return <p className="text-[12px] text-ink-3">No versions recorded.</p>;

  return (
    <ol className="space-y-1.5">
      {state.versions.map((v) => (
        <li key={v.versionId} className={cn("flex items-center gap-2.5 rounded-lg border px-2.5 py-2", v.isCurrent ? "border-primary/30 bg-primary/[0.06]" : "border-line")}>
          <span className={cn("size-1.5 shrink-0 rounded-full", v.isCurrent ? "bg-primary-hi" : "bg-ink-3")} aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] text-foreground" title={v.fileName}>
              {v.fileName}
            </span>
            <span className="block text-[11px] text-ink-3" title={formatFull(v.createdAt)}>
              {v.isCurrent ? "Current · " : ""}
              {formatFinderDate(v.createdAt)}
              {v.size != null && ` · ${formatBytes(v.size)}`}
            </span>
          </span>
          {!v.isCurrent && (
            <button
              type="button"
              onClick={() => download(v)}
              disabled={busy === v.versionId}
              aria-label={`Download version from ${formatFinderDate(v.createdAt)}`}
              className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-white/[0.08] hover:text-foreground disabled:opacity-50", compact && "size-6")}
            >
              {busy === v.versionId ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowDownToLine className="size-3.5" />}
            </button>
          )}
        </li>
      ))}
    </ol>
  );
}

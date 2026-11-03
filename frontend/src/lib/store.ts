"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getAuditLogs, getFiles } from "./api";
import type { AuditEvent, VaultFile } from "./types";

/**
 * A tiny stale-while-revalidate cache shared across routes, so moving between
 * Workspace, Explorer and Activity is instant and each API is hit at most once per
 * window unless the user refreshes.
 */
interface Snapshot<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  updatedAt: number;
}

const STALE_MS = 30_000;

function createResource<T>(fetcher: (signal?: AbortSignal) => Promise<T>) {
  let snapshot: Snapshot<T> = { data: null, error: null, loading: false, updatedAt: 0 };
  let inflight: Promise<T | null> | null = null;
  const listeners = new Set<() => void>();

  const set = (patch: Partial<Snapshot<T>>) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((l) => l());
  };

  const load = (): Promise<T | null> => {
    if (inflight) return inflight;
    set({ loading: true });
    inflight = fetcher()
      .then((data) => {
        set({ data, error: null, loading: false, updatedAt: Date.now() });
        return data;
      })
      .catch((err: unknown) => {
        set({ error: err instanceof Error ? err.message : "Request failed.", loading: false });
        return null;
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  };

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    load,
    ensureFresh() {
      if (Date.now() - snapshot.updatedAt > STALE_MS) void load();
    },
  };
}

const serverSnapshot = { data: null, error: null, loading: true, updatedAt: 0 };

export const filesResource = createResource<VaultFile[]>(getFiles);
export const auditResource = createResource<AuditEvent[]>(getAuditLogs);

function useResource<T>(resource: ReturnType<typeof createResource<T>>, enabled = true) {
  const snap = useSyncExternalStore(
    resource.subscribe,
    resource.getSnapshot,
    () => serverSnapshot as Snapshot<T>,
  );
  useEffect(() => {
    if (enabled) resource.ensureFresh();
  }, [resource, enabled]);
  return {
    data: snap.data,
    error: snap.error,
    // "loading" means there is nothing to show yet; background refreshes stay quiet.
    loading: snap.data === null && (snap.loading || (enabled && snap.updatedAt === 0 && !snap.error)),
    refreshing: snap.loading && snap.data !== null,
    refresh: resource.load,
  };
}

export function useFiles(enabled = true) {
  const r = useResource(filesResource, enabled);
  return { ...r, files: r.data ?? [] };
}

export function useAudit(enabled = true) {
  const r = useResource(auditResource, enabled);
  return { ...r, events: r.data ?? [] };
}

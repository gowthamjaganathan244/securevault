"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/Input";
import { Search, ShieldCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useEffect, useMemo, useState } from "react";

const AUDIT_API_URL =
  "https://0oatkqbq9l.execute-api.ap-southeast-2.amazonaws.com/audit-logs";

type AuditLogEntry = {
  auditId: string;
  action: string;
  userEmail: string;
  userRole: string;
  result: string;
  fileId?: string;
  fileName?: string;
  reason?: string;
  timestamp: string;
};

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString();
}

function ActionBadge({ action }: { action: string }) {
  let styles = "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
  if (action === "FILE_DOWNLOADED") {
    styles = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  } else if (action === "DOWNLOAD_DENIED") {
    styles = "bg-orange-500/10 text-orange-400 border-orange-500/20";
  }
  const label = action.replace(/_/g, " ");
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles}`}>
      {label}
    </span>
  );
}

function ResultBadge({ result }: { result: string }) {
  const styles =
    result === "SUCCESS"
      ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
      : "bg-rose-500/10 text-rose-500 border-rose-500/20";
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles}`}>
      {result}
    </span>
  );
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("All Actions");
  const [resultFilter, setResultFilter] = useState("All Results");

  async function fetchLogs() {
    try {
      setIsLoading(true);
      setErrorMessage("");

      const response = await fetch(AUDIT_API_URL, {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Failed to load audit logs.");
      }

      const data = await response.json();
      const entries: AuditLogEntry[] = data.auditLogs || [];

      // Sort newest first
      entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      setLogs(entries);
    } catch (error) {
      console.error("Failed to fetch audit logs:", error);
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to load audit logs."
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const query = searchQuery.toLowerCase();

      const matchesSearch =
        log.userEmail?.toLowerCase().includes(query) ||
        log.action?.toLowerCase().includes(query) ||
        log.fileName?.toLowerCase().includes(query) ||
        log.reason?.toLowerCase().includes(query);

      const matchesAction =
        actionFilter === "All Actions" || log.action === actionFilter;

      const matchesResult =
        resultFilter === "All Results" || log.result === resultFilter;

      return matchesSearch && matchesAction && matchesResult;
    });
  }, [logs, searchQuery, actionFilter, resultFilter]);

  return (
    <div className="space-y-8 pb-8">
      <PageHeader 
        title="Compliance & Audit Logs" 
        subtitle="Immutable record of system activities."
        action={
          <div className="flex items-center text-emerald-500 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20 text-sm font-medium">
            <ShieldCheck className="mr-1.5 h-4 w-4" />
            Integrity Verified
          </div>
        }
      />

      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-card/50 p-4 rounded-xl border border-white/5 backdrop-blur-md">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search logs by user, action, or file..." 
            className="pl-9 bg-black/20"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <select
            className="h-9 rounded-md border border-input bg-black/20 px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring [&>option]:bg-zinc-900"
            value={actionFilter}
            onChange={(event) => setActionFilter(event.target.value)}
          >
            <option value="All Actions">All Actions</option>
            <option value="FILE_DOWNLOADED">File Downloaded</option>
            <option value="DOWNLOAD_DENIED">Download Denied</option>
          </select>
          <select
            className="h-9 rounded-md border border-input bg-black/20 px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring [&>option]:bg-zinc-900"
            value={resultFilter}
            onChange={(event) => setResultFilter(event.target.value)}
          >
            <option value="All Results">All Results</option>
            <option value="SUCCESS">Success</option>
            <option value="FAILED">Failed</option>
          </select>
          <Button variant="outline" className="bg-black/20" onClick={fetchLogs}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground bg-card/30 rounded-xl border border-white/5">
          Loading audit logs...
        </div>
      ) : errorMessage ? (
        <div className="p-4 text-center text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl">
          {errorMessage}
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground bg-card/30 rounded-xl border border-white/5">
          No audit events found.
        </div>
      ) : (
        <Card className="overflow-hidden border border-white/5">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-white/5">
                <tr>
                  <th className="px-6 py-4 font-medium">Timestamp</th>
                  <th className="px-6 py-4 font-medium">Action</th>
                  <th className="px-6 py-4 font-medium">Result</th>
                  <th className="px-6 py-4 font-medium">User</th>
                  <th className="px-6 py-4 font-medium">Role</th>
                  <th className="px-6 py-4 font-medium">File Name</th>
                  <th className="px-6 py-4 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredLogs.map((log) => (
                  <tr key={log.auditId} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">
                      {formatTimestamp(log.timestamp)}
                    </td>
                    <td className="px-6 py-4">
                      <ActionBadge action={log.action} />
                    </td>
                    <td className="px-6 py-4">
                      <ResultBadge result={log.result} />
                    </td>
                    <td className="px-6 py-4 text-foreground font-medium">{log.userEmail}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                        {log.userRole}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground font-mono text-xs">
                      {log.fileName || "—"}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground text-xs max-w-[200px] truncate">
                      {log.reason || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

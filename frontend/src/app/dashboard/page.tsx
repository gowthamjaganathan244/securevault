"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { SummaryCard } from "@/components/dashboard/SummaryCard";
import { SecurityStatus } from "@/components/dashboard/SecurityStatus";
import { AuditTrendChart } from "@/components/dashboard/AuditTrendChart";
import { Card } from "@/components/ui/Card";
import { ClassificationPill } from "@/components/files/ClassificationPill";
import { StatusBadge } from "@/components/files/StatusBadge";
import { FolderLock, ShieldAlert, FileKey, Users } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const FILES_API_URL =
  "https://0oatkqbq9l.execute-api.ap-southeast-2.amazonaws.com/files";
const AUDIT_API_URL =
  "https://0oatkqbq9l.execute-api.ap-southeast-2.amazonaws.com/audit-logs";

type DashboardFile = {
  fileId: string;
  fileName: string;
  classification: "Public" | "Internal" | "Confidential" | "Restricted";
  status: string;
  uploadedBy?: string;
  uploadedAt?: string;
  createdAt?: string;
  objectSize?: number;
  s3Key?: string;
};

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

type StatusType = "Available" | "Processing" | "Quarantined" | "Success" | "Failed" | "Active" | "Inactive";

function normalizeStatus(status: string): StatusType {
  if (status === "ACTIVE") return "Available";
  if (status === "PENDING_UPLOAD") return "Processing";
  return status as StatusType;
}

function formatBytes(bytes?: number) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatDate(value?: string) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

export default function DashboardPage() {
  const [files, setFiles] = useState<DashboardFile[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboardData() {
      setIsLoading(true);
      try {
        const [filesRes, auditRes] = await Promise.allSettled([
          fetch(FILES_API_URL, { method: "GET", cache: "no-store" }),
          fetch(AUDIT_API_URL, { method: "GET", cache: "no-store" }),
        ]);

        if (filesRes.status === "fulfilled" && filesRes.value.ok) {
          const data = await filesRes.value.json();
          setFiles(data.files || []);
        }

        if (auditRes.status === "fulfilled" && auditRes.value.ok) {
          const data = await auditRes.value.json();
          setAuditLogs(data.auditLogs || []);
        }
      } catch (error) {
        console.error("Dashboard data fetch error:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchDashboardData();
  }, []);

  // --- Computed stats ---
  const totalFiles = files.length;

  const restrictedFiles = files.filter(
    (f) => f.classification === "Restricted"
  ).length;

  const todayStr = new Date().toISOString().slice(0, 10);
  const auditEventsToday = auditLogs.filter((log) =>
    log.timestamp.startsWith(todayStr)
  ).length;

  // Recent files: sort by uploadedAt/createdAt desc, take 5
  const recentFiles = useMemo(() => {
    return [...files]
      .sort((a, b) => {
        const dateA = new Date(a.uploadedAt || a.createdAt || 0).getTime();
        const dateB = new Date(b.uploadedAt || b.createdAt || 0).getTime();
        return dateB - dateA;
      })
      .slice(0, 5);
  }, [files]);

  // Audit trend: group logs by date for the last 7 days
  const weeklyTrend = useMemo(() => {
    const days: { day: string; events: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const dayLabel = d.toLocaleDateString("en-US", { weekday: "short" });
      const count = auditLogs.filter((log) =>
        log.timestamp.startsWith(dateStr)
      ).length;
      days.push({ day: dayLabel, events: count });
    }
    return days;
  }, [auditLogs]);

  return (
    <div className="space-y-8 pb-8">
      <PageHeader 
        title="Dashboard Overview" 
        subtitle="Welcome back. Here is your system snapshot."
        action={
          <div className="flex space-x-3">
            <Link href="/audit-logs" className={buttonVariants({ variant: "outline" })}>
              View Logs
            </Link>
            <Link href="/upload" className={buttonVariants({ variant: "default" })}>
              Upload File
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <SummaryCard 
          title="Total Protected Files" 
          value={isLoading ? "..." : totalFiles} 
          icon={FolderLock} 
        />
        <SummaryCard 
          title="Restricted Access" 
          value={isLoading ? "..." : restrictedFiles} 
          icon={FileKey} 
        />
        <SummaryCard 
          title="Audit Events Today" 
          value={isLoading ? "..." : auditEventsToday} 
          icon={ShieldAlert} 
        />
        <SummaryCard 
          title="Active Sessions" 
          value={1} 
          icon={Users} 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <AuditTrendChart data={weeklyTrend} />
        <div className="lg:col-span-1">
          <SecurityStatus />
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold tracking-tight">Recent File Activity</h3>
          <Link href="/files" className={`${buttonVariants({ variant: "link" })} text-primary`}>
            View all files &rarr;
          </Link>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground bg-card/30 rounded-xl border border-white/5">
            Loading recent files...
          </div>
        ) : recentFiles.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground bg-card/30 rounded-xl border border-white/5">
            No files uploaded yet.
          </div>
        ) : (
          <Card className="overflow-hidden border border-white/5">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-white/5">
                  <tr>
                    <th className="px-6 py-4 font-medium">File Name</th>
                    <th className="px-6 py-4 font-medium">Classification</th>
                    <th className="px-6 py-4 font-medium">Owner</th>
                    <th className="px-6 py-4 font-medium">Uploaded</th>
                    <th className="px-6 py-4 font-medium">Size</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {recentFiles.map((file) => (
                    <tr key={file.fileId} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4 font-medium text-foreground">{file.fileName}</td>
                      <td className="px-6 py-4">
                        <ClassificationPill level={file.classification} />
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{file.uploadedBy || "Unknown"}</td>
                      <td className="px-6 py-4 text-muted-foreground">{formatDate(file.uploadedAt || file.createdAt)}</td>
                      <td className="px-6 py-4 text-muted-foreground">{formatBytes(file.objectSize)}</td>
                      <td className="px-6 py-4">
                        <StatusBadge status={normalizeStatus(file.status)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

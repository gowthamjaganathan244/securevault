"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/Input";
import { Search, Download, RefreshCw, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ClassificationPill } from "@/components/files/ClassificationPill";
import { StatusBadge } from "@/components/files/StatusBadge";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "react-oidc-context";

const FILES_API_URL =
  "https://0oatkqbq9l.execute-api.ap-southeast-2.amazonaws.com/files";

const DOWNLOAD_API_URL =
  "https://0oatkqbq9l.execute-api.ap-southeast-2.amazonaws.com/download-url";

type SecureVaultFile = {
  fileId: string;
  fileName: string;
  classification: "Public" | "Internal" | "Confidential" | "Restricted";
  status: string;
  auditNote?: string;
  createdAt?: string;
  uploadedAt?: string;
  contentType?: string;
  objectSize?: number;
  uploadedBy?: string;
  s3Key?: string;
};

function formatBytes(bytes?: number) {
  if (!bytes) return "Unknown";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatDate(value?: string) {
  if (!value) return "Unknown";
  return new Date(value).toLocaleString();
}

type StatusType = "Available" | "Processing" | "Quarantined" | "Success" | "Failed" | "Active" | "Inactive";

function normalizeStatus(status: string): StatusType {
  if (status === "ACTIVE") return "Available";
  if (status === "PENDING_UPLOAD") return "Processing";
  return status as StatusType;
}

export default function FilesPage() {
  const auth = useAuth();
  const [files, setFiles] = useState<SecureVaultFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [classificationFilter, setClassificationFilter] = useState("All Classifications");
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState("");

  // Derive user email and role from Cognito auth
  const userEmail = auth.user?.profile?.email as string ?? "";
  const groupsRaw = auth.user?.profile?.["cognito:groups"];
  const groups: string[] = Array.isArray(groupsRaw)
    ? groupsRaw
    : typeof groupsRaw === "string" ? [groupsRaw] : [];
  let userRole = "User";
  if (groups.includes("Admin")) userRole = "Admin";
  else if (groups.includes("Auditor")) userRole = "Auditor";

  async function fetchFiles() {
    try {
      setIsLoading(true);
      setErrorMessage("");

      const response = await fetch(FILES_API_URL, {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Failed to load files.");
      }

      const data = await response.json();
      setFiles(data.files || []);
    } catch (error) {
      console.error("Failed to fetch SecureVault files:", error);
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to load files."
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchFiles();
  }, []);

  const filteredFiles = useMemo(() => {
    return files.filter((file) => {
      const query = searchQuery.toLowerCase();

      const matchesSearch =
        file.fileName?.toLowerCase().includes(query) ||
        file.uploadedBy?.toLowerCase().includes(query) ||
        file.auditNote?.toLowerCase().includes(query) ||
        file.s3Key?.toLowerCase().includes(query);

      const matchesClassification =
        classificationFilter === "All Classifications" ||
        file.classification === classificationFilter;

      return matchesSearch && matchesClassification;
    });
  }, [files, searchQuery, classificationFilter]);

  async function handleDownload(file: SecureVaultFile) {
    setDownloadingFileId(file.fileId);
    setDownloadError("");

    try {
      const params = new URLSearchParams({
        fileId: file.fileId,
        userEmail,
        userRole,
      });

      const response = await fetch(`${DOWNLOAD_API_URL}?${params.toString()}`, {
        method: "GET",
      });

      if (response.status === 403) {
        setDownloadError("You are not allowed to download this file.");
        return;
      }

      if (response.status === 404) {
        setDownloadError("File not found.");
        return;
      }

      if (!response.ok) {
        setDownloadError("Unable to generate download link.");
        return;
      }

      const data = await response.json();

      if (data.downloadUrl) {
        window.open(data.downloadUrl, "_blank");
      } else {
        setDownloadError("Unable to generate download link.");
      }
    } catch (error) {
      console.error("Download failed:", error);
      setDownloadError("Unable to generate download link.");
    } finally {
      setDownloadingFileId(null);
    }
  }

  const isAuditor = userRole === "Auditor";

  return (
    <div className="space-y-8 pb-8">
      <PageHeader 
        title="Secure Files" 
        subtitle="Manage and access classified documents."
      />

      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-card/50 p-4 rounded-xl border border-white/5 backdrop-blur-md">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search by file name or owner..." 
            className="pl-9 bg-black/20"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>
        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <select 
            className="flex h-9 w-full sm:w-auto rounded-md border border-input bg-black/20 px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring [&>option]:bg-zinc-900"
            value={classificationFilter}
            onChange={(event) => setClassificationFilter(event.target.value)}
          >
            <option value="All Classifications">All Classifications</option>
            <option value="Public">Public</option>
            <option value="Internal">Internal</option>
            <option value="Confidential">Confidential</option>
            <option value="Restricted">Restricted</option>
          </select>
          <Button variant="outline" className="bg-black/20" onClick={fetchFiles}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {downloadError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{downloadError}</span>
          <button
            onClick={() => setDownloadError("")}
            className="ml-auto text-red-400 hover:text-red-300 text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground bg-card/30 rounded-xl border border-white/5">
          Loading secure files...
        </div>
      ) : errorMessage ? (
        <div className="p-4 text-center text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl">
          Failed to load files. Please try again.
        </div>
      ) : filteredFiles.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground bg-card/30 rounded-xl border border-white/5">
          No files found.
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
                  <th className="px-6 py-4 font-medium">Uploaded Date</th>
                  <th className="px-6 py-4 font-medium">Size</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredFiles.map((file) => (
                  <tr key={file.fileId} className="hover:bg-white/5 transition-colors group">
                    <td className="px-6 py-4 font-medium text-foreground">
                      <div>{file.fileName}</div>
                      {file.s3Key && (
                        <div className="text-xs text-muted-foreground mt-0.5">{file.s3Key}</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <ClassificationPill level={file.classification} />
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{file.uploadedBy || "Unknown"}</td>
                    <td className="px-6 py-4 text-muted-foreground">{formatDate(file.uploadedAt || file.createdAt)}</td>
                    <td className="px-6 py-4 text-muted-foreground">{formatBytes(file.objectSize)}</td>
                    <td className="px-6 py-4">
                      <StatusBadge status={normalizeStatus(file.status)} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        {!isAuditor && (
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={downloadingFileId === file.fileId}
                            onClick={() => handleDownload(file)}
                          >
                            {downloadingFileId === file.fileId ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Download className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </div>
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

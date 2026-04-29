"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { mockFiles } from "@/data/mockFiles";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { ClassificationPill } from "@/components/files/ClassificationPill";
import { StatusBadge } from "@/components/files/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Download, FileText, Info, ShieldCheck, Activity } from "lucide-react";
import { useState } from "react";
import { use } from "react";

export default function FileDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const fileId = resolvedParams.id;
  const file = mockFiles.find((f) => f.id === fileId);
  const [downloading, setDownloading] = useState(false);

  if (!file) {
    notFound();
  }

  const handleDownload = () => {
    setDownloading(true);
    setTimeout(() => setDownloading(false), 2000);
  };

  return (
    <div className="space-y-8 pb-8">
      <PageHeader 
        title={file.name} 
        subtitle={`File ID: ${file.id} • Managed by ${file.owner}`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-white/5">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Info className="mr-2 h-5 w-5 text-primary" />
                File Metadata
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-y-6 gap-x-4 text-sm">
                <div>
                  <p className="text-muted-foreground mb-1">Classification</p>
                  <ClassificationPill level={file.classification} />
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Status</p>
                  <StatusBadge status={file.status} />
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Uploaded Date</p>
                  <p className="font-medium">{file.uploadedAt}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">File Size</p>
                  <p className="font-medium">{file.size}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground mb-1">S3 Key Location</p>
                  <code className="px-2 py-1 bg-black/30 rounded text-xs text-primary font-mono break-all">
                    s3://securevault-prod-enclave/{file.classification.toLowerCase()}/{file.id}/{file.name}
                  </code>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/5">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Activity className="mr-2 h-5 w-5 text-accent" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-start pb-4 border-b border-white/5">
                  <div>
                    <p className="text-sm font-medium">File Uploaded</p>
                    <p className="text-xs text-muted-foreground">By {file.owner}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{file.uploadedAt}</span>
                </div>
                <div className="flex justify-between items-start pb-4 border-b border-white/5">
                  <div>
                    <p className="text-sm font-medium">Malware Scan Passed</p>
                    <p className="text-xs text-muted-foreground">Automated System</p>
                  </div>
                  <span className="text-xs text-muted-foreground">Shortly after upload</span>
                </div>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium">Viewed by Admin</p>
                    <p className="text-xs text-muted-foreground">System Audit</p>
                  </div>
                  <span className="text-xs text-muted-foreground">Today</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="bg-card/30 border-white/5">
            <CardContent className="p-6">
              <div className="flex flex-col items-center justify-center p-6 bg-black/20 rounded-xl mb-6">
                <FileText className="h-16 w-16 text-muted-foreground mb-4" />
                <p className="text-sm font-medium text-center">Preview not available for encrypted files</p>
              </div>
              <Button 
                className="w-full font-semibold shadow-[0_0_10px_rgba(59,130,246,0.2)]" 
                size="lg"
                onClick={handleDownload}
                disabled={downloading || file.status === "Quarantined"}
              >
                <Download className="mr-2 h-5 w-5" />
                {downloading ? "Generating URL..." : "Secure Download"}
              </Button>
              <p className="text-xs text-center text-muted-foreground mt-3">
                Downloads use temporary S3 presigned URLs. Action will be audited.
              </p>
            </CardContent>
          </Card>

          <Card className="border-white/5">
            <CardContent className="p-6">
              <div className="flex items-center text-foreground mb-4 space-x-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Access Rules</h3>
              </div>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li className="flex items-center"><CheckCircleIcon className="mr-2 h-4 w-4 text-primary" /> MFA Required</li>
                <li className="flex items-center"><CheckCircleIcon className="mr-2 h-4 w-4 text-primary" /> Admin/Auditor Access</li>
                {file.classification === "Restricted" && (
                  <li className="flex items-center"><CheckCircleIcon className="mr-2 h-4 w-4 text-primary" /> Require Justification</li>
                )}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function CheckCircleIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

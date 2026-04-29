"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { UploadDropzone } from "@/components/upload/UploadDropzone";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ShieldAlert, CheckCircle2, AlertCircle } from "lucide-react";
import { useState } from "react";

export default function UploadPage() {
  const API_URL =
    "https://0oatkqbq9l.execute-api.ap-southeast-2.amazonaws.com/generate-upload-url";

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [classification, setClassification] = useState("Internal");
  const [auditNote, setAuditNote] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [fileId, setFileId] = useState("");
  const [s3Key, setS3Key] = useState("");

  const handleUpload = async () => {
    if (!selectedFile) {
      setErrorMessage("Please select a file first.");
      return;
    }

    setIsUploading(true);
    setIsSuccess(false);
    setErrorMessage("");
    setFileId("");
    setS3Key("");
    
    try {
      console.log("Step 1: Requesting presigned upload URL");
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileName: selectedFile.name,
          contentType: selectedFile.type || "application/octet-stream",
          classification,
          uploadedBy: "gowthamtamiljagan@gmail.com",
          auditNote
        })
      });

      if (!response.ok) {
        throw new Error("Failed to generate secure upload URL.");
      }

      console.log("Step 1 success: Presigned URL received");
      const metadata = await response.json();

      console.log("Step 2: Uploading file to S3");
      const uploadResponse = await fetch(metadata.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": selectedFile.type || "application/octet-stream",
        },
        body: selectedFile
      });

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload file to private S3 bucket.");
      }

      console.log("Step 2 success: File uploaded to S3");
      setFileId(metadata.fileId);
      setS3Key(metadata.s3Key);
      setIsSuccess(true);
      setSelectedFile(null);
      setAuditNote("");
    } catch (error) {
      console.error("SecureVault upload failed:", error);
      setErrorMessage(error instanceof Error ? error.message : "Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-8">
      <PageHeader
        title="Secure File Upload"
        subtitle="Transfer sensitive documents into the secure enclave."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-6">
          <UploadDropzone
            selectedFile={selectedFile}
            onFileSelect={(file) => {
              setSelectedFile(file);
              setIsSuccess(false);
              setErrorMessage("");
              setFileId("");
              setS3Key("");
            }}
          />

          <Card className="border-white/5">
            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Classification Level</label>
                <select 
                  className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring [&>option]:bg-zinc-900"
                  value={classification}
                  onChange={(event) => setClassification(event.target.value)}
                >
                  <option value="Public">Public (No Restrictions)</option>
                  <option value="Internal">Internal Use Only</option>
                  <option value="Confidential">Confidential (Need to Know)</option>
                  <option value="Restricted">Restricted (C-Level & Board Only)</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Audit Notes (Optional)</label>
                <Input 
                  placeholder="Reason for upload..." 
                  value={auditNote}
                  onChange={(event) => setAuditNote(event.target.value)}
                />
              </div>

              {errorMessage && (
                <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
                  <AlertCircle className="h-4 w-4" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {!isSuccess ? (
                <Button
                  className="w-full h-12 text-base font-semibold"
                  onClick={handleUpload}
                  disabled={isUploading}
                >
                  {isUploading ? "Generating secure URL and uploading..." : "Upload to Vault"}
                </Button>
              ) : (
                <div className="flex flex-col items-center justify-center p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-500 space-y-2">
                  <CheckCircle2 className="h-8 w-8" />
                  <p className="font-medium">File successfully secured.</p>
                  <p className="text-xs opacity-80">Presigned S3 transfer complete.</p>
                  <p className="text-xs opacity-80">DynamoDB metadata will update to ACTIVE through the S3 trigger.</p>
                  {fileId && <p className="text-xs opacity-80">File ID: {fileId}</p>}
                  {s3Key && <p className="text-xs opacity-80">S3 Key: {s3Key}</p>}
                  <Button 
                    variant="outline" 
                    className="mt-4 border-emerald-500/50 hover:bg-emerald-500/20" 
                    onClick={() => {
                      setIsSuccess(false);
                      setErrorMessage("");
                      setFileId("");
                      setS3Key("");
                      setSelectedFile(null);
                      setAuditNote("");
                    }}
                  >
                    Upload Another
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="bg-amber-500/5 border-amber-500/20">
            <CardContent className="p-6">
              <div className="flex items-center text-amber-500 mb-4 space-x-2">
                <ShieldAlert className="h-5 w-5" />
                <h3 className="font-semibold">Security Notice</h3>
              </div>
              <ul className="text-sm text-muted-foreground space-y-3 list-disc list-inside">
                <li>Files are uploaded using short-lived presigned URLs.</li>
                <li>Files are stored in a private Amazon S3 bucket.</li>
                <li>Upload metadata is tracked in DynamoDB.</li>
                <li>S3 ObjectCreated events confirm successful uploads automatically.</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

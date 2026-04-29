"use client";

import { UploadCloud, File as FileIcon } from "lucide-react";
import { Card } from "../ui/Card";
import { useState, useRef } from "react";
import { cn } from "@/lib/utils";

type UploadDropzoneProps = {
  selectedFile: File | null;
  onFileSelect: (file: File) => void;
};

export function UploadDropzone({ selectedFile, onFileSelect }: UploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  if (selectedFile) {
    return (
      <Card
        className="border-2 border-primary/50 bg-primary/5 transition-all duration-200 ease-in-out cursor-pointer h-64 flex flex-col items-center justify-center p-6"
        onClick={() => inputRef.current?.click()}
      >
        <input 
          type="file" 
          className="hidden" 
          accept=".pdf,.doc,.docx,.xls,.xlsx,.zip"
          ref={inputRef} 
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFileSelect(file);
          }} 
        />
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/20 mb-4 text-primary">
          <FileIcon className="h-8 w-8" />
        </div>
        <h3 className="text-lg font-medium text-foreground text-center line-clamp-1 break-all max-w-full">
          {selectedFile.name}
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Click to change file
        </p>
      </Card>
    );
  }

  return (
    <>
      <input 
        type="file" 
        className="hidden" 
        accept=".pdf,.doc,.docx,.xls,.xlsx,.zip"
        ref={inputRef} 
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFileSelect(file);
        }} 
      />
      <Card
        className={cn(
          "border-2 border-dashed transition-all duration-200 ease-in-out cursor-pointer h-64 flex flex-col items-center justify-center bg-card/30 hover:bg-card/50",
          isDragging ? "border-primary bg-primary/5" : "border-muted"
        )}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) onFileSelect(file);
        }}
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-4">
          <UploadCloud className="h-8 w-8 text-primary" />
        </div>
        <h3 className="text-lg font-medium text-foreground">Click to upload or drag and drop</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Secure transfer via S3 presigned URL (max 500MB)
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Supported formats: PDF, DOCX, XLSX, ZIP
        </p>
      </Card>
    </>
  );
}

import type { Metadata } from "next";
import { UploadStudio } from "@/components/views/UploadStudio";

export const metadata: Metadata = { title: "Upload Studio" };

export default function UploadPage() {
  return <UploadStudio />;
}

import type { Metadata } from "next";
import { UploadStudio } from "@/components/views/UploadStudio";

export const metadata: Metadata = { title: "Check-in" };

export default function UploadPage() {
  return <UploadStudio />;
}

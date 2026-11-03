import type { Metadata } from "next";
import { PassportView } from "@/components/views/PassportView";

export const metadata: Metadata = { title: "Document passport" };

export default async function FileDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PassportView fileId={decodeURIComponent(id)} />;
}

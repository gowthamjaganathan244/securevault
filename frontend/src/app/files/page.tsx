import type { Metadata } from "next";
import { Suspense } from "react";
import { ExplorerView } from "@/components/views/ExplorerView";

export const metadata: Metadata = { title: "Explorer" };

export default function FilesPage() {
  return (
    <Suspense>
      <ExplorerView />
    </Suspense>
  );
}

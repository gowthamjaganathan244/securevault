import type { Metadata } from "next";
import { Suspense } from "react";
import { ActivityView } from "@/components/views/ActivityView";

export const metadata: Metadata = { title: "Activity" };

export default function AuditLogsPage() {
  return (
    <Suspense>
      <ActivityView />
    </Suspense>
  );
}

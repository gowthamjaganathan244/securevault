import type { Metadata } from "next";
import { DeskView } from "@/components/views/DeskView";

export const metadata: Metadata = { title: "Inspection Lane" };

export default function DashboardPage() {
  return <DeskView />;
}

import type { Metadata } from "next";
import { DeskView } from "@/components/views/DeskView";

export const metadata: Metadata = { title: "Workspace" };

export default function DashboardPage() {
  return <DeskView />;
}

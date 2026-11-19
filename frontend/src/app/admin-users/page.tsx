import type { Metadata } from "next";
import { PeopleView } from "@/components/views/PeopleView";

export const metadata: Metadata = { title: "Clearance Rules" };

export default function AdminUsersPage() {
  return <PeopleView />;
}

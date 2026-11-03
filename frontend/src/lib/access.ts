import { CloudUpload, FolderOpen, History, LayoutDashboard, ShieldUser, type LucideIcon } from "lucide-react";
import type { UserRole } from "./types";

export interface Destination {
  href: string;
  label: string;
  /** Used where space is tight (phone tab bar). */
  shortLabel: string;
  hint: string;
  icon: LucideIcon;
  roles: UserRole[];
}

/**
 * Navigation rules enforced by this interface. They mirror the original
 * sidebar (Admin: everything, User: files + upload, Auditor: audit logs),
 * with the Workspace open to everyone because Cognito returns all users there.
 * These are UI rules only — the APIs themselves decide what data they return.
 */
export const destinations: Destination[] = [
  { href: "/dashboard", label: "Workspace", shortLabel: "Workspace", hint: "Home", icon: LayoutDashboard, roles: ["Admin", "User", "Auditor"] },
  { href: "/files", label: "Explorer", shortLabel: "Explorer", hint: "All documents", icon: FolderOpen, roles: ["Admin", "User"] },
  { href: "/upload", label: "Upload", shortLabel: "Upload", hint: "Secure document upload", icon: CloudUpload, roles: ["Admin", "User"] },
  { href: "/audit-logs", label: "Activity", shortLabel: "Activity", hint: "Audit timeline", icon: History, roles: ["Admin", "Auditor", "User"] },
  { href: "/admin-users", label: "People & Access", shortLabel: "People", hint: "Users and permissions", icon: ShieldUser, roles: ["Admin"] },
];

export function destinationsFor(role: UserRole) {
  return destinations.filter((d) => d.roles.includes(role));
}

export function destinationFor(pathname: string) {
  return destinations.find((d) => pathname === d.href || pathname.startsWith(`${d.href}/`));
}

export function canVisit(role: UserRole, pathname: string) {
  const d = destinationFor(pathname);
  return !d || d.roles.includes(role);
}

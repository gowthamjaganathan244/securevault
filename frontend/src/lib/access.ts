import { Archive, FileUp, Link2, ScanLine, ShieldCheck, type LucideIcon } from "lucide-react";
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
 * The facility's areas, in the order a document moves through them.
 * Routes are unchanged so existing links and bookmarks keep working.
 * Role rules mirror the original app (Admin: everything, User: archive +
 * check-in, Auditor: audit history). These are UI rules only — the APIs
 * decide what data each role actually receives.
 */
export const destinations: Destination[] = [
  { href: "/dashboard", label: "Inspection Lane", shortLabel: "Lane", hint: "Documents moving through screening", icon: ScanLine, roles: ["Admin", "User", "Auditor"] },
  { href: "/upload", label: "Check-in", shortLabel: "Check-in", hint: "Bring a document into the vault", icon: FileUp, roles: ["Admin", "User"] },
  { href: "/files", label: "Archive", shortLabel: "Archive", hint: "Protected documents", icon: Archive, roles: ["Admin", "User"] },
  { href: "/audit-logs", label: "Chain of Inspection", shortLabel: "Chain", hint: "Recorded activity", icon: Link2, roles: ["Admin", "Auditor", "User"] },
  { href: "/admin-users", label: "Clearance Rules", shortLabel: "Clearance", hint: "People and access control", icon: ShieldCheck, roles: ["Admin"] },
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

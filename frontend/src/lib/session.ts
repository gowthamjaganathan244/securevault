"use client";

import { useAuthState } from "@/components/auth/AuthProvider";
import type { UserRole } from "./types";

export function rolesFromGroups(groupsRaw: unknown): string[] {
  if (Array.isArray(groupsRaw)) return groupsRaw.map(String);
  if (typeof groupsRaw === "string") return [groupsRaw];
  return [];
}

// Same precedence the app has always used: Admin > Auditor > User.
export function primaryRole(groups: string[]): UserRole {
  if (groups.includes("Admin")) return "Admin";
  if (groups.includes("Auditor")) return "Auditor";
  return "User";
}

/** The signed-in user, derived from the Cognito ID token held by Amplify. */
export function useSession() {
  const { status, claims, expiresAt, signOut } = useAuthState();
  const email = (claims?.email as string | undefined) ?? "";
  const groups = rolesFromGroups(claims?.["cognito:groups"]);
  const role = primaryRole(groups);
  const displayName =
    (claims?.given_name as string | undefined) || (claims?.name as string | undefined) || email.split("@")[0] || "there";

  return { status, profile: claims, expiresAt, email, groups, role, displayName, signOut };
}

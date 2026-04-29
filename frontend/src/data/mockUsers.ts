import { User } from "@/lib/types";

export const mockUsers: User[] = [
  {
    id: "u-001",
    name: "Admin User",
    email: "admin@securevault.local",
    role: "Admin",
    mfaEnabled: true,
    status: "Active",
    lastActive: "2026-04-24T15:42:10Z"
  },
  {
    id: "u-002",
    name: "John Doe",
    email: "jdoe@securevault.local",
    role: "User",
    mfaEnabled: true,
    status: "Active",
    lastActive: "2026-04-24T14:15:00Z"
  },
  {
    id: "u-003",
    name: "Jane Smith",
    email: "jsmith@securevault.local",
    role: "Auditor",
    mfaEnabled: true,
    status: "Active",
    lastActive: "2026-04-24T13:20:12Z"
  },
  {
    id: "u-004",
    name: "Inactive User",
    email: "former@securevault.local",
    role: "User",
    mfaEnabled: false,
    status: "Inactive",
    lastActive: "2025-11-10T09:00:00Z"
  }
];

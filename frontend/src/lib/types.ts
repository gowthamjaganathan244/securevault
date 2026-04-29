export type UserRole = "Admin" | "User" | "Auditor";
export type ClassificationLevel = "Public" | "Internal" | "Confidential" | "Restricted";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  mfaEnabled: boolean;
  status: "Active" | "Inactive";
  lastActive: string;
}

export interface FileRecord {
  id: string;
  name: string;
  classification: ClassificationLevel;
  owner: string;
  uploadedAt: string;
  size: string;
  status: "Available" | "Processing" | "Quarantined";
}

export interface AuditLog {
  id: string;
  timestamp: string;
  user: string;
  role: UserRole;
  action: string;
  resource: string;
  result: "Success" | "Failed";
}

export interface SummaryStats {
  totalFiles: number;
  restrictedFiles: number;
  auditEventsToday: number;
  activeUsers: number;
  weeklyTrend: { day: string; events: number }[];
}

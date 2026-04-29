import { AuditLog } from "@/lib/types";

export const mockAuditLogs: AuditLog[] = [
  {
    id: "al-101",
    timestamp: "2026-04-24 15:42:10 UTC",
    user: "Admin User",
    role: "Admin",
    action: "Login",
    resource: "System",
    result: "Success"
  },
  {
    id: "al-102",
    timestamp: "2026-04-24 15:42:45 UTC",
    user: "Admin User",
    role: "Admin",
    action: "MFA Verification",
    resource: "System",
    result: "Success"
  },
  {
    id: "al-103",
    timestamp: "2026-04-24 14:15:00 UTC",
    user: "John Doe",
    role: "User",
    action: "File Upload",
    resource: "vendor-risk-assessment.xlsx",
    result: "Success"
  },
  {
    id: "al-104",
    timestamp: "2026-04-24 13:20:12 UTC",
    user: "Jane Smith",
    role: "Auditor",
    action: "File View",
    resource: "finance-audit-summary.pdf",
    result: "Success"
  },
  {
    id: "al-105",
    timestamp: "2026-04-24 11:05:33 UTC",
    user: "John Doe",
    role: "User",
    action: "Download Presigned URL Generated",
    resource: "employee-contract-2026.pdf",
    result: "Success"
  },
  {
    id: "al-106",
    timestamp: "2026-04-24 09:12:05 UTC",
    user: "Admin User",
    role: "Admin",
    action: "Access Admin Panel",
    resource: "Users Page",
    result: "Success"
  },
  {
    id: "al-107",
    timestamp: "2026-04-24 08:30:00 UTC",
    user: "John Doe",
    role: "User",
    action: "Access Restricted File",
    resource: "restricted-incident-report.pdf",
    result: "Failed"
  }
];

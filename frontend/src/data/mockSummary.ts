import { SummaryStats } from "@/lib/types";

export const mockSummary: SummaryStats = {
  totalFiles: 1284,
  restrictedFiles: 42,
  auditEventsToday: 356,
  activeUsers: 89,
  weeklyTrend: [
    { day: "Mon", events: 120 },
    { day: "Tue", events: 210 },
    { day: "Wed", events: 180 },
    { day: "Thu", events: 356 },
    { day: "Fri", events: 240 },
    { day: "Sat", events: 45 },
    { day: "Sun", events: 30 }
  ]
};

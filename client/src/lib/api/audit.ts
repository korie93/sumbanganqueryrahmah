import { apiRequest } from "../queryClient";

export async function getAuditLogs() {
  const response = await apiRequest("GET", "/api/audit-logs");
  return response.json();
}

export async function getAuditLogStats() {
  const response = await apiRequest("GET", "/api/audit-logs/stats");
  return response.json();
}

export async function cleanupAuditLogs(olderThanDays: number) {
  const response = await apiRequest("DELETE", "/api/audit-logs/cleanup", { olderThanDays });
  return response.json();
}

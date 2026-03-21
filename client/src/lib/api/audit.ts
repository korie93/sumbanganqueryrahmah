import { apiRequest } from "../queryClient";

export async function getAuditLogs(params?: {
  page?: number;
  pageSize?: number;
  action?: string;
  performedBy?: string;
  targetUser?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
}) {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.pageSize) query.set("pageSize", String(params.pageSize));
  if (params?.action) query.set("action", params.action);
  if (params?.performedBy) query.set("performedBy", params.performedBy);
  if (params?.targetUser) query.set("targetUser", params.targetUser);
  if (params?.search) query.set("search", params.search);
  if (params?.dateFrom) query.set("dateFrom", params.dateFrom);
  if (params?.dateTo) query.set("dateTo", params.dateTo);
  if (params?.sortBy) query.set("sortBy", params.sortBy);
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  const response = await apiRequest("GET", `/api/audit-logs${suffix}`);
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

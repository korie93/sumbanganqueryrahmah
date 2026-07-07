import { apiRequest } from "../api-client";
import { auditLogsResponseSchema } from "@shared/api-contracts";
import { z } from "zod";
import { parseApiJson } from "./contract";

type AuditLogStatsResponse = {
  total: number;
  olderThan30Days: number;
  olderThan60Days: number;
  olderThan90Days: number;
  olderThan180Days: number;
  olderThan365Days: number;
  oldestLogDate: string | null;
};

type AuditLogCleanupResponse = {
  success: boolean;
  deletedCount: number;
  message: string;
};

const nonNegativeIntegerSchema = z.number().int().nonnegative();

const auditLogStatsLegacyResponseSchema = z.object({
  total: nonNegativeIntegerSchema,
  olderThan30Days: nonNegativeIntegerSchema,
  olderThan60Days: nonNegativeIntegerSchema,
  olderThan90Days: nonNegativeIntegerSchema,
  olderThan180Days: nonNegativeIntegerSchema.optional().default(0),
  olderThan365Days: nonNegativeIntegerSchema.optional().default(0),
  oldestLogDate: z.string().min(1).nullable(),
}).transform((stats): AuditLogStatsResponse => ({
  total: stats.total,
  olderThan30Days: stats.olderThan30Days,
  olderThan60Days: stats.olderThan60Days,
  olderThan90Days: stats.olderThan90Days,
  olderThan180Days: stats.olderThan180Days,
  olderThan365Days: stats.olderThan365Days,
  oldestLogDate: stats.oldestLogDate,
}));

const auditLogStatsWireResponseSchema = z.object({
  totalLogs: nonNegativeIntegerSchema,
  todayLogs: nonNegativeIntegerSchema,
  actionBreakdown: z.record(nonNegativeIntegerSchema),
  olderThan30Days: nonNegativeIntegerSchema.optional().default(0),
  olderThan60Days: nonNegativeIntegerSchema.optional().default(0),
  olderThan90Days: nonNegativeIntegerSchema.optional().default(0),
  olderThan180Days: nonNegativeIntegerSchema.optional().default(0),
  olderThan365Days: nonNegativeIntegerSchema.optional().default(0),
  oldestLogDate: z.string().min(1).nullable().optional().default(null),
}).transform((stats): AuditLogStatsResponse => ({
  total: stats.totalLogs,
  olderThan30Days: stats.olderThan30Days,
  olderThan60Days: stats.olderThan60Days,
  olderThan90Days: stats.olderThan90Days,
  olderThan180Days: stats.olderThan180Days,
  olderThan365Days: stats.olderThan365Days,
  oldestLogDate: stats.oldestLogDate,
}));

const auditLogStatsResponseSchema = z.union([
  auditLogStatsLegacyResponseSchema,
  auditLogStatsWireResponseSchema,
]);

const auditLogCleanupResponseSchema: z.ZodType<AuditLogCleanupResponse> = z.object({
  success: z.boolean(),
  deletedCount: nonNegativeIntegerSchema,
  message: z.string().min(1),
});

export async function getAuditLogs(params?: {
  page?: number | undefined;
  pageSize?: number | undefined;
  action?: string | undefined;
  performedBy?: string | undefined;
  targetUser?: string | undefined;
  search?: string | undefined;
  risk?: string | undefined;
  category?: string | undefined;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
  sortBy?: string | undefined;
}) {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.pageSize) query.set("pageSize", String(params.pageSize));
  if (params?.action) query.set("action", params.action);
  if (params?.performedBy) query.set("performedBy", params.performedBy);
  if (params?.targetUser) query.set("targetUser", params.targetUser);
  if (params?.search) query.set("search", params.search);
  if (params?.risk) query.set("risk", params.risk);
  if (params?.category) query.set("category", params.category);
  if (params?.dateFrom) query.set("dateFrom", params.dateFrom);
  if (params?.dateTo) query.set("dateTo", params.dateTo);
  if (params?.sortBy) query.set("sortBy", params.sortBy);
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  const response = await apiRequest("GET", `/api/audit-logs${suffix}`);
  return parseApiJson(response, auditLogsResponseSchema, "/api/audit-logs");
}

export async function getAuditLogStats() {
  const response = await apiRequest("GET", "/api/audit-logs/stats");
  return parseApiJson(response, auditLogStatsResponseSchema, "/api/audit-logs/stats");
}

export async function cleanupAuditLogs(olderThanDays: number) {
  const response = await apiRequest("DELETE", "/api/audit-logs/cleanup", { olderThanDays });
  return parseApiJson(response, auditLogCleanupResponseSchema, "/api/audit-logs/cleanup");
}

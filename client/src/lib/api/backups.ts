import { apiRequest } from "../api-client";
import { parseApiJson } from "./contract";
import type { BackupJobEnqueueResponse, BackupJobRecord } from "@/pages/backup-restore/types";
import { z } from "zod";

const BACKUP_EXPORT_TIMEOUT_MS = 5 * 60_000;

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(jsonValueSchema),
  ]),
);

const backupRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  createdAt: z.string().min(1),
  createdBy: z.string(),
  metadata: z.unknown().nullable().optional(),
});

const backupPaginationSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().positive(),
});

const backupsListResponseSchema = z.object({
  backups: z.array(backupRecordSchema),
  pagination: backupPaginationSchema,
});

const backupJobErrorSchema = z.object({
  message: z.string().min(1),
  statusCode: z.number().int(),
});

const backupJobSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["create", "restore"]),
  status: z.enum(["queued", "running", "completed", "failed"]),
  requestedBy: z.string().min(1),
  requestedAt: z.string().min(1),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  backupId: z.string().nullable(),
  backupName: z.string().nullable(),
  queuePosition: z.number().int(),
  result: jsonValueSchema,
  error: backupJobErrorSchema.nullable(),
});

const backupJobEnqueueResponseSchema = z.object({
  message: z.string().min(1),
  job: backupJobSchema,
});

const backupRestoreStatsSchema = z.object({
  processed: z.number().int().nonnegative(),
  inserted: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  reactivated: z.number().int().nonnegative(),
});

const backupRestoreResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().min(1),
  backupId: z.string().min(1).optional(),
  backupName: z.string().optional(),
  restoredAt: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
  stats: z.object({
    imports: backupRestoreStatsSchema,
    dataRows: backupRestoreStatsSchema,
    users: backupRestoreStatsSchema,
    auditLogs: backupRestoreStatsSchema,
    collectionRecords: backupRestoreStatsSchema,
    collectionRecordReceipts: backupRestoreStatsSchema,
    warnings: z.array(z.string()),
    totalProcessed: z.number().int().nonnegative(),
    totalInserted: z.number().int().nonnegative(),
    totalSkipped: z.number().int().nonnegative(),
    totalReactivated: z.number().int().nonnegative(),
  }),
});

const backupDeleteResponseSchema = z.object({
  success: z.literal(true),
});

export async function createBackup(name: string) {
  const response = await apiRequest("POST", "/api/backups", { name });
  return parseApiJson(response, backupRecordSchema, "/api/backups");
}

export async function createBackupAsync(name: string): Promise<BackupJobEnqueueResponse> {
  const response = await apiRequest("POST", "/api/backups?async=1", { name });
  return parseApiJson(response, backupJobEnqueueResponseSchema, "/api/backups?async=1");
}

export async function getBackups(params?: {
  page?: number | undefined;
  pageSize?: number | undefined;
  searchName?: string | undefined;
  createdBy?: string | undefined;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
  sortBy?: string | undefined;
}) {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.pageSize) query.set("pageSize", String(params.pageSize));
  if (params?.searchName) query.set("searchName", params.searchName);
  if (params?.createdBy) query.set("createdBy", params.createdBy);
  if (params?.dateFrom) query.set("dateFrom", params.dateFrom);
  if (params?.dateTo) query.set("dateTo", params.dateTo);
  if (params?.sortBy) query.set("sortBy", params.sortBy);
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  const response = await apiRequest("GET", `/api/backups${suffix}`);
  return parseApiJson(response, backupsListResponseSchema, "/api/backups");
}

export async function getBackupById(id: string) {
  const response = await apiRequest("GET", `/api/backups/${id}`);
  return parseApiJson(response, backupRecordSchema, `/api/backups/${id}`);
}

export async function restoreBackup(id: string) {
  const response = await apiRequest("POST", `/api/backups/${id}/restore`);
  return parseApiJson(response, backupRestoreResponseSchema, `/api/backups/${id}/restore`);
}

export async function restoreBackupAsync(id: string): Promise<BackupJobEnqueueResponse> {
  const response = await apiRequest("POST", `/api/backups/${id}/restore?async=1`);
  return parseApiJson(
    response,
    backupJobEnqueueResponseSchema,
    `/api/backups/${id}/restore?async=1`,
  );
}

export async function getBackupJob(id: string): Promise<BackupJobRecord> {
  const response = await apiRequest("GET", `/api/backups/jobs/${id}`);
  return parseApiJson(response, backupJobSchema, `/api/backups/jobs/${id}`);
}

export async function deleteBackup(id: string) {
  const response = await apiRequest("DELETE", `/api/backups/${id}`);
  return parseApiJson(response, backupDeleteResponseSchema, `/api/backups/${id}`);
}

export async function exportBackup(id: string): Promise<Blob> {
  const response = await apiRequest("GET", `/api/backups/${id}/export`, undefined, {
    timeoutMs: BACKUP_EXPORT_TIMEOUT_MS,
  });
  return response.blob();
}

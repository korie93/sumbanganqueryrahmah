import { apiRequest } from "../api-client";
import type { BackupJobEnqueueResponse, BackupJobRecord } from "@/pages/backup-restore/types";

const BACKUP_EXPORT_TIMEOUT_MS = 5 * 60_000;

export async function createBackup(name: string) {
  const response = await apiRequest("POST", "/api/backups", { name });
  return response.json();
}

export async function createBackupAsync(name: string): Promise<BackupJobEnqueueResponse> {
  const response = await apiRequest("POST", "/api/backups?async=1", { name });
  return response.json();
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
  return response.json();
}

export async function getBackupById(id: string) {
  const response = await apiRequest("GET", `/api/backups/${id}`);
  return response.json();
}

export async function restoreBackup(id: string) {
  const response = await apiRequest("POST", `/api/backups/${id}/restore`);
  return response.json();
}

export async function restoreBackupAsync(id: string): Promise<BackupJobEnqueueResponse> {
  const response = await apiRequest("POST", `/api/backups/${id}/restore?async=1`);
  return response.json();
}

export async function getBackupJob(id: string): Promise<BackupJobRecord> {
  const response = await apiRequest("GET", `/api/backups/jobs/${id}`);
  return response.json();
}

export async function deleteBackup(id: string) {
  const response = await apiRequest("DELETE", `/api/backups/${id}`);
  return response.json();
}

export async function exportBackup(id: string): Promise<Blob> {
  const response = await apiRequest("GET", `/api/backups/${id}/export`, undefined, {
    timeoutMs: BACKUP_EXPORT_TIMEOUT_MS,
  });
  return response.blob();
}

import type {
  AuditLog,
  Backup,
  InsertAuditLog,
  InsertBackup,
} from "../../../shared/schema-postgres";
import type {
  BackupDataPayload,
  RestoreStats,
} from "../../repositories/backups-repository-types";
import type {
  MutationIdempotencyAcquireInput,
  MutationIdempotencyAcquireResult,
  MutationIdempotencyCompleteInput,
} from "../../storage-postgres";
import type {
  RecentLoginActivity,
  RecentLoginActivityPage,
  RecentLoginActivityPageOptions,
} from "../../repositories/analytics-repository-shared";
import { PostgresCollectionStorage } from "./postgres-collection-storage";

export class PostgresOperationsStorage extends PostgresCollectionStorage {
  async acquireMutationIdempotency(
    params: MutationIdempotencyAcquireInput,
  ): Promise<MutationIdempotencyAcquireResult> {
    return this.mutationIdempotencyRepository.acquire(params);
  }

  async completeMutationIdempotency(params: MutationIdempotencyCompleteInput): Promise<void> {
    return this.mutationIdempotencyRepository.complete(params);
  }

  async releaseMutationIdempotency(
    params: Pick<MutationIdempotencyAcquireInput, "scope" | "actor" | "idempotencyKey">,
  ): Promise<void> {
    return this.mutationIdempotencyRepository.release(params);
  }

  async createAuditLog(data: InsertAuditLog): Promise<AuditLog> {
    return this.auditRepository.createAuditLog(data);
  }

  async getAuditLogs(): Promise<AuditLog[]> {
    return this.auditRepository.getAuditLogs();
  }

  async createBackup(data: InsertBackup): Promise<Backup> {
    return this.backupsRepository.createBackup(data);
  }

  async getBackups(): Promise<Backup[]> {
    return this.backupsRepository.getBackups();
  }

  async getBackupById(id: string): Promise<Backup | undefined> {
    return this.backupsRepository.getBackupById(id);
  }

  async deleteBackup(id: string): Promise<boolean> {
    return this.backupsRepository.deleteBackup(id);
  }

  async restoreFromBackup(backupData: BackupDataPayload): Promise<{
    success: boolean;
    stats: RestoreStats;
  }> {
    return this.backupsRepository.restoreFromBackup(backupData);
  }

  async getDashboardSummary(): Promise<{
    totalUsers: number;
    activeSessions: number;
    loginsToday: number;
    totalDataRows: number;
    totalImports: number;
    bannedUsers: number;
  }> {
    return this.analyticsRepository.getDashboardSummary();
  }

  async getLoginTrends(
    days: number = 7,
  ): Promise<Array<{ date: string; logins: number; logouts: number }>> {
    return this.analyticsRepository.getLoginTrends(days);
  }

  async getTopActiveUsers(
    limit: number = 10,
  ): Promise<
    Array<{
      username: string;
      role: string;
      loginCount: number;
      lastLogin: string | null;
    }>
  > {
    return this.analyticsRepository.getTopActiveUsers(limit);
  }

  async getRecentLoginActivity(
    limit: number = 8,
  ): Promise<RecentLoginActivity[]> {
    return this.analyticsRepository.getRecentLoginActivity(limit);
  }

  async getRecentLoginActivityPage(
    options: RecentLoginActivityPageOptions,
  ): Promise<RecentLoginActivityPage> {
    return this.analyticsRepository.getRecentLoginActivityPage(options);
  }

  async getPeakHours(): Promise<Array<{ hour: number; count: number }>> {
    return this.analyticsRepository.getPeakHours();
  }

  async getRoleDistribution(): Promise<Array<{ role: string; count: number }>> {
    return this.analyticsRepository.getRoleDistribution();
  }
}

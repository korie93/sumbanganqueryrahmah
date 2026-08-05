import type {
  AuditLog,
  Backup,
  DataRow,
  Import,
  InsertAuditLog,
  InsertBackup,
} from "../../../shared/schema-postgres";
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

  async restoreFromBackup(backupData: {
    imports: Import[];
    dataRows: DataRow[];
    users: Array<{
      username: string;
      role: string;
      isBanned: boolean | null;
      passwordHash?: string;
      twoFactorEnabled?: boolean;
      twoFactorSecretEncrypted?: string | null;
      twoFactorConfiguredAt?: string | Date | null;
      failedLoginAttempts?: number;
      lockedAt?: string | Date | null;
      lockedReason?: string | null;
      lockedBySystem?: boolean;
    }>;
    auditLogs: AuditLog[];
    collectionRecords?: Array<{
      id: string;
      customerName: string;
      icNumber: string;
      customerPhone: string;
      accountNumber: string;
      batch: string;
      paymentDate: string;
      amount: string | number;
      receiptFile: string | null;
      createdByLogin: string;
      collectionStaffNickname: string;
      staffUsername?: string | null;
      createdAt: string | Date;
    }>;
    collectionRecordPurgeHistory?: Array<{
      id: string;
      sourceImportId?: string | null;
      sourceDataRowId?: string | null;
      sourceImportName?: string | null;
      sourceFilename?: string | null;
      icNumberSearchHash?: string | null;
      customerPhoneSearchHash?: string | null;
      accountNumberSearchHash?: string | null;
      paymentDate: string;
      amount: string | number;
      createdByLogin: string;
      collectionStaffNickname: string;
      originalCreatedAt: string | Date;
      purgedAt: string | Date;
      purgedBy: string;
      purgeReason: "retention_policy";
    }>;
    collectionRecordReceipts?: Array<{
      id: string;
      collectionRecordId: string;
      storagePath: string;
      originalFileName: string;
      originalMimeType: string;
      originalExtension: string;
      fileSize: number;
      createdAt: string | Date;
    }>;
  }): Promise<{
    success: boolean;
    stats: {
      imports: { processed: number; inserted: number; skipped: number; reactivated: number };
      dataRows: { processed: number; inserted: number; skipped: number; reactivated: number };
      users: { processed: number; inserted: number; skipped: number; reactivated: number };
      auditLogs: { processed: number; inserted: number; skipped: number; reactivated: number };
      collectionRecords: { processed: number; inserted: number; skipped: number; reactivated: number };
      collectionRecordPurgeHistory: { processed: number; inserted: number; skipped: number; reactivated: number };
      collectionRecordReceipts: { processed: number; inserted: number; skipped: number; reactivated: number };
      warnings: string[];
      totalProcessed: number;
      totalInserted: number;
      totalSkipped: number;
      totalReactivated: number;
    };
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

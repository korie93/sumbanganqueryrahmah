import type {
  AuditLog,
  Backup,
  DataRow,
  Import,
  InsertAuditLog,
  InsertBackup,
} from "../shared/schema-postgres";

export interface AuditBackupStorageContract {
  createAuditLog(data: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(): Promise<AuditLog[]>;

  createBackup(data: InsertBackup): Promise<Backup>;
  getBackups(): Promise<Backup[]>;
  getBackupById(id: string): Promise<Backup | undefined>;
  deleteBackup(id: string): Promise<boolean>;
  restoreFromBackup(backupData: {
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
      collectionRecords: {
        processed: number;
        inserted: number;
        skipped: number;
        reactivated: number;
      };
      collectionRecordReceipts: {
        processed: number;
        inserted: number;
        skipped: number;
        reactivated: number;
      };
      warnings: string[];
      totalProcessed: number;
      totalInserted: number;
      totalSkipped: number;
      totalReactivated: number;
    };
  }>;
}

import type {
  AuditLog,
  Backup,
  InsertAuditLog,
  InsertBackup,
} from "../shared/schema-postgres";
import type {
  BackupDataPayload,
  RestoreStats,
} from "./repositories/backups-repository-types";

export interface AuditBackupStorageContract {
  createAuditLog(data: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(): Promise<AuditLog[]>;

  createBackup(data: InsertBackup): Promise<Backup>;
  getBackups(): Promise<Backup[]>;
  getBackupById(id: string): Promise<Backup | undefined>;
  deleteBackup(id: string): Promise<boolean>;
  restoreFromBackup(backupData: BackupDataPayload): Promise<{
    success: boolean;
    stats: RestoreStats;
  }>;
}

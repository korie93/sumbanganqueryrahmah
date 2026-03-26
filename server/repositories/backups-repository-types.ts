import type {
  AuditLog,
  Backup,
  DataRow,
  Import,
  InsertBackup,
} from "../../shared/schema-postgres";

export const BACKUP_CHUNK_SIZE = 500;
export const QUERY_PAGE_LIMIT = 1000;
export const BACKUP_LIST_DEFAULT_PAGE_SIZE = 25;
export const BACKUP_LIST_MAX_PAGE_SIZE = 100;

export type BackupsRepositoryOptions = {
  ensureBackupsTable: () => Promise<void>;
  parseBackupMetadataSafe: (raw: unknown) => Record<string, any> | null;
};

export type RestoreDatasetStats = {
  processed: number;
  inserted: number;
  skipped: number;
  reactivated: number;
};

export type BackupUserRecord = {
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
};

export type BackupCollectionRecord = {
  id: string;
  customerName: string;
  icNumber: string;
  customerPhone: string;
  accountNumber: string;
  batch: string;
  paymentDate: string;
  amount: string | number;
  receiptFile: string | null;
  receiptTotalAmount?: string | number | null;
  receiptValidationStatus?: "matched" | "mismatch" | "needs_review" | string | null;
  receiptValidationMessage?: string | null;
  receiptCount?: number | null;
  createdByLogin: string;
  collectionStaffNickname: string;
  staffUsername?: string | null;
  createdAt: string | Date;
};

export type BackupCollectionReceipt = {
  id: string;
  collectionRecordId: string;
  storagePath: string;
  originalFileName: string;
  originalMimeType: string;
  originalExtension: string;
  fileSize: number;
  receiptAmount?: string | number | null;
  extractedAmount?: string | number | null;
  extractionConfidence?: number | string | null;
  receiptDate?: string | Date | null;
  receiptReference?: string | null;
  fileHash?: string | null;
  createdAt: string | Date;
};

export type BackupDataPayload = {
  imports: Import[];
  dataRows: DataRow[];
  users: BackupUserRecord[];
  auditLogs: AuditLog[];
  collectionRecords?: BackupCollectionRecord[];
  collectionRecordReceipts?: BackupCollectionReceipt[];
};

export type BackupListSort = "newest" | "oldest" | "name-asc" | "name-desc";

export type BackupListPageParams = {
  page?: number;
  pageSize?: number;
  searchName?: string;
  createdBy?: string;
  dateFrom?: Date;
  dateTo?: Date;
  sortBy?: BackupListSort;
};

export type BackupListPageResult = {
  backups: Backup[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type RestoreStats = {
  imports: RestoreDatasetStats;
  dataRows: RestoreDatasetStats;
  users: RestoreDatasetStats;
  auditLogs: RestoreDatasetStats;
  collectionRecords: RestoreDatasetStats;
  collectionRecordReceipts: RestoreDatasetStats;
  warnings: string[];
  totalProcessed: number;
  totalInserted: number;
  totalSkipped: number;
  totalReactivated: number;
};

export function createRestoreDatasetStats(): RestoreDatasetStats {
  return {
    processed: 0,
    inserted: 0,
    skipped: 0,
    reactivated: 0,
  };
}

export type CreateBackupFn = (data: InsertBackup) => Promise<Backup>;

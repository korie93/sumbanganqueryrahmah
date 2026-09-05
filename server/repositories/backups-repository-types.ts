import type {
  AuditLog,
  Backup,
  DataRow,
  Import,
  InsertBackup,
} from "../../shared/schema-postgres";
import type {
  CollectionAmountCentsLike,
  CollectionAmountMyrLike,
} from "../../shared/collection-amount-types";

export const BACKUP_CHUNK_SIZE = 500;
export const QUERY_PAGE_LIMIT = 1000;
export const BACKUP_LIST_DEFAULT_PAGE_SIZE = 25;
export const BACKUP_LIST_MAX_PAGE_SIZE = 100;
export const BACKUP_MAX_SERIALIZED_ROW_BYTES = 512 * 1024;
export const BACKUP_STORAGE_APPEND_CHUNK_BYTES = 128 * 1024;
export const BACKUP_STORAGE_DB_READ_PAGE_SIZE = 64;

export type BackupsRepositoryOptions = {
  ensureBackupsTable: () => Promise<void>;
  parseBackupMetadataSafe: (raw: unknown) => Record<string, unknown> | null;
};

export type BackupAmountMyr = CollectionAmountMyrLike;
export type BackupAmountCents = CollectionAmountCentsLike;

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
  customerName?: string | null;
  customerNameEncrypted?: string | null;
  customerNameSearchHashes?: string[] | null;
  icNumber?: string | null;
  icNumberEncrypted?: string | null;
  customerPhone?: string | null;
  customerPhoneEncrypted?: string | null;
  accountNumber?: string | null;
  accountNumberEncrypted?: string | null;
  cardNumberLast4?: string | null;
  sourceImportId?: string | null;
  sourceDataRowId?: string | null;
  sourceImportName?: string | null;
  sourceFilename?: string | null;
  agingBucket?: string | null;
  totalDue?: BackupAmountMyr | null;
  billingPrincipalOsp?: BackupAmountMyr | null;
  callingDate?: string | null;
  callingWindowEndExclusive?: string | null;
  sourceMatchBasis?: string | null;
  sourceMatchAccuracy?: number | null;
  sourceObligationKey?: string | null;
  settlementCycleKey?: string | null;
  classification?: "cp" | "abort_cp" | string | null;
  cumulativeCollected?: BackupAmountMyr | null;
  remainingAmount?: BackupAmountMyr | null;
  settlementOverrideStatus?: "ACTIVE" | "REVOKED" | string | null;
  poolAmount?: BackupAmountMyr | null;
  manualSettlementDate?: string | null;
  manualSettlementReason?: string | null;
  manualSettlementNote?: string | null;
  manualSettlementReference?: string | null;
  manualSettlementVersion?: number | null;
  manualSettlementVerifiedBy?: string | null;
  manualSettlementVerifiedAt?: string | Date | null;
  manualSettlementUpdatedBy?: string | null;
  manualSettlementUpdatedAt?: string | Date | null;
  manualSettlementRevokedBy?: string | null;
  manualSettlementRevokedAt?: string | Date | null;
  manualSettlementRevokedReason?: string | null;
  batch: string;
  paymentDate: string;
  amount: BackupAmountMyr;
  receiptFile: string | null;
  receiptTotalAmountCents?: BackupAmountCents | null;
  receiptTotalAmount?: BackupAmountMyr | null;
  receiptValidationStatus?: "matched" | "underpaid" | "overpaid" | "unverified" | "needs_review" | string | null;
  receiptValidationMessage?: string | null;
  receiptCount?: number | null;
  duplicateReceiptFlag?: boolean | null;
  createdByLogin: string;
  collectionStaffNickname: string;
  staffUsername?: string | null;
  createdAt: string | Date;
};

export type BackupCollectionSourceConfig = {
  id: string;
  validFrom: string;
  validTo: string;
  cycleKey: string;
  enabled: boolean;
  compatibilityStatus: "compatible" | "incompatible" | string;
  compatibilityIssues?: string[] | null;
  indexedRowCount: number;
  configuredBy: string;
  createdAt: string | Date;
  updatedAt: string | Date;
};

export type BackupCollectionSourceRow = {
  id: string;
  sourceImportId: string;
  accountNumberHash?: string | null;
  cardNumberHash?: string | null;
  cardNumberLast4?: string | null;
  canonicalObligationKey: string;
  totalDue: BackupAmountMyr;
  billingPrincipalOsp: BackupAmountMyr;
  totalOsb?: BackupAmountMyr | null;
  agingBucket: "D3" | "D4" | "D5" | "D6" | string;
  callingDate: string;
  createdAt: string | Date;
};

export type BackupCollectionOspTarget = {
  id: string;
  sourceScopeHash: string;
  sourceImportIds: string[];
  periodFrom: string;
  periodTo: string;
  agingBucket: "D3" | "D4" | "D5" | "D6" | string;
  totalOspBaseline?: BackupAmountMyr | null;
  targetPercentage: BackupAmountMyr;
  configuredBy: string;
  createdAt: string | Date;
  updatedAt: string | Date;
};

export type BackupCollectionOspSavedTarget = {
  id: string;
  targetName: string;
  normalizedName: string;
  description?: string | null;
  status: "ACTIVE" | "DELETED" | string;
  version: number;
  createdBy: string;
  createdAt: string | Date;
  updatedBy: string;
  updatedAt: string | Date;
  deletedBy?: string | null;
  deletedAt?: string | Date | null;
};

export type BackupCollectionOspTargetRevision = {
  id: string;
  targetId: string;
  revisionNumber: number;
  sourceScopeHash: string;
  periodFrom: string;
  periodTo: string;
  trackingStartDate: string;
  trackingEndDate?: string | null;
  timezone: string;
  nicknameScope: string[];
  agingScope: string[];
  calculationVersion: string;
  createdBy: string;
  createdAt: string | Date;
};

export type BackupCollectionOspTargetSource = {
  targetRevisionId: string;
  sourceImportId: string;
  sourceNameSnapshot: string;
  sourceFilenameSnapshot: string;
  sourceVersionSnapshot?: string | null;
  sourceContentHashSnapshot?: string | null;
  createdAt: string | Date;
};

export type BackupCollectionOspTargetSourceRow = {
  targetRevisionId: string;
  sourceImportId: string;
  sourceDataRowId: string;
  canonicalObligationKey: string;
  cycleKey: string;
  accountNumberEncrypted?: string | null;
  accountNumberSearchHash?: string | null;
  cardNumberLast4?: string | null;
  customerNameEncrypted?: string | null;
  customerNameSearchHashes?: string[] | null;
  agingBucket: string;
  callingDate: string;
  callingWindowEndExclusive: string;
  totalDue: BackupAmountMyr;
  billingPrincipalOsp: BackupAmountMyr;
  createdAt: string | Date;
};

export type BackupCollectionOspTargetAgingRow = {
  targetRevisionId: string;
  agingBucket: string;
  totalOspBaseline: BackupAmountMyr;
  targetPercentage: BackupAmountMyr;
  targetOsp: BackupAmountMyr;
  createdAt: string | Date;
};

export type BackupCollectionOspClientResult = {
  id: string;
  targetId: string;
  targetRevisionId: string;
  asOfDate: string;
  agingBucket: string;
  resultPercentage: BackupAmountMyr;
  ospClosed: BackupAmountMyr;
  clientReference?: string | null;
  note?: string | null;
  version: number;
  createdBy: string;
  createdAt: string | Date;
  updatedBy: string;
  updatedAt: string | Date;
};

export type BackupCollectionOspManualReconciliation = {
  id: string;
  targetId: string;
  targetRevisionId: string;
  sourceImportId: string;
  sourceDataRowId: string;
  canonicalObligationKey: string;
  cycleKey: string;
  accountNumberEncrypted?: string | null;
  accountNumberSearchHash?: string | null;
  cardNumberLast4?: string | null;
  customerNameEncrypted?: string | null;
  // This is derived from the encrypted snapshot during export. The live
  // reconciliation table intentionally does not persist it, but restore uses
  // it to prove that the immutable reconciliation snapshot still matches its
  // restored source row after PII is re-encrypted for the destination key.
  customerNameSearchHashes?: string[] | null;
  agingBucket: string;
  callingDate: string;
  callingWindowEndExclusive: string;
  totalDue: BackupAmountMyr;
  billingPrincipalOsp: BackupAmountMyr;
  manualPriorAmount: BackupAmountMyr;
  manualAsOfDate: string;
  actualPaymentDate?: string | null;
  dateSource: string;
  reasonCode: string;
  note?: string | null;
  evidenceReference?: string | null;
  status: string;
  version: number;
  createdBy: string;
  createdAt: string | Date;
  updatedBy: string;
  updatedAt: string | Date;
  voidedBy?: string | null;
  voidedAt?: string | Date | null;
  voidReason?: string | null;
};

export type BackupCollectionOspManualReconciliationAudit = {
  id: string;
  reconciliationId: string;
  targetId: string;
  targetRevisionId: string;
  operation: string;
  fromVersion?: number | null;
  toVersion: number;
  beforeState?: Record<string, unknown> | null;
  afterState: Record<string, unknown>;
  actorUsername: string;
  actorRole: string;
  requestId?: string | null;
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
  receiptAmountCents?: BackupAmountCents | null;
  receiptAmount?: BackupAmountMyr | null;
  extractedAmountCents?: BackupAmountCents | null;
  extractedAmount?: BackupAmountMyr | null;
  extractionStatus?: string | null;
  extractionConfidence?: number | string | null;
  receiptDate?: string | Date | null;
  receiptReference?: string | null;
  fileHash?: string | null;
  createdAt: string | Date;
};

export type BackupCollectionRecordPurgeHistory = {
  id: string;
  sourceImportId?: string | null;
  sourceDataRowId?: string | null;
  sourceObligationKey?: string | null;
  sourceImportName?: string | null;
  sourceFilename?: string | null;
  icNumberSearchHash?: string | null;
  customerPhoneSearchHash?: string | null;
  accountNumberSearchHash?: string | null;
  paymentDate: string;
  amount: BackupAmountMyr;
  automaticClassification?: "cp" | "abort_cp" | string | null;
  settlementOverrideStatus?: "ACTIVE" | "REVOKED" | string | null;
  poolAmount?: BackupAmountMyr | null;
  manualSettlementDate?: string | null;
  manualSettlementReason?: string | null;
  manualSettlementNote?: string | null;
  manualSettlementReference?: string | null;
  manualSettlementVersion?: number | null;
  manualSettlementVerifiedBy?: string | null;
  manualSettlementVerifiedAt?: string | Date | null;
  manualSettlementUpdatedBy?: string | null;
  manualSettlementUpdatedAt?: string | Date | null;
  manualSettlementRevokedBy?: string | null;
  manualSettlementRevokedAt?: string | Date | null;
  manualSettlementRevokedReason?: string | null;
  createdByLogin: string;
  collectionStaffNickname: string;
  originalCreatedAt: string | Date;
  purgedAt: string | Date;
  purgedBy: string;
  purgeReason: "retention_policy";
};

export type BackupDataPayload = {
  imports: Import[];
  dataRows: DataRow[];
  users: BackupUserRecord[];
  auditLogs: AuditLog[];
  collectionSourceConfigs?: BackupCollectionSourceConfig[];
  collectionSourceRows?: BackupCollectionSourceRow[];
  collectionOspTargets?: BackupCollectionOspTarget[];
  collectionRecords?: BackupCollectionRecord[];
  collectionRecordPurgeHistory?: BackupCollectionRecordPurgeHistory[];
  collectionRecordReceipts?: BackupCollectionReceipt[];
  collectionOspSavedTargets?: BackupCollectionOspSavedTarget[];
  collectionOspTargetRevisions?: BackupCollectionOspTargetRevision[];
  collectionOspTargetSources?: BackupCollectionOspTargetSource[];
  collectionOspTargetSourceRows?: BackupCollectionOspTargetSourceRow[];
  collectionOspTargetAgingRows?: BackupCollectionOspTargetAgingRow[];
  collectionOspClientResults?: BackupCollectionOspClientResult[];
  collectionOspManualReconciliations?: BackupCollectionOspManualReconciliation[];
  collectionOspManualReconciliationAudit?: BackupCollectionOspManualReconciliationAudit[];
};

export type BackupPayloadCounts = {
  importsCount: number;
  dataRowsCount: number;
  usersCount: number;
  auditLogsCount: number;
  collectionSourceConfigsCount: number;
  collectionSourceRowsCount: number;
  collectionOspTargetsCount: number;
  collectionRecordsCount: number;
  collectionRecordPurgeHistoryCount: number;
  collectionRecordReceiptsCount: number;
  collectionOspSavedTargetsCount: number;
  collectionOspTargetRevisionsCount: number;
  collectionOspTargetSourcesCount: number;
  collectionOspTargetSourceRowsCount: number;
  collectionOspTargetAgingRowsCount: number;
  collectionOspClientResultsCount: number;
  collectionOspManualReconciliationsCount: number;
  collectionOspManualReconciliationAuditCount: number;
};

export type PreparedBackupPayloadFile = {
  tempFilePath: string;
  payloadChecksumSha256: string;
  counts: BackupPayloadCounts;
  payloadBytes: number;
  maxSerializedRowBytes?: number;
  memoryRssBytes?: number;
  memoryHeapUsedBytes?: number;
  tempPayloadEncrypted: boolean;
  tempPayloadStoragePrefix?: string;
  cleanup: () => Promise<void>;
};

export type BackupListSort = "newest" | "oldest" | "name-asc" | "name-desc";

export type BackupListPageParams = {
  page?: number | undefined;
  pageSize?: number | undefined;
  searchName?: string | undefined;
  createdBy?: string | undefined;
  dateFrom?: Date | undefined;
  dateTo?: Date | undefined;
  sortBy?: BackupListSort | undefined;
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
  collectionSourceConfigs: RestoreDatasetStats;
  collectionSourceRows: RestoreDatasetStats;
  collectionOspTargets: RestoreDatasetStats;
  collectionRecords: RestoreDatasetStats;
  collectionRecordPurgeHistory: RestoreDatasetStats;
  collectionRecordReceipts: RestoreDatasetStats;
  collectionOspSavedTargets: RestoreDatasetStats;
  collectionOspTargetRevisions: RestoreDatasetStats;
  collectionOspTargetSources: RestoreDatasetStats;
  collectionOspTargetSourceRows: RestoreDatasetStats;
  collectionOspTargetAgingRows: RestoreDatasetStats;
  collectionOspClientResults: RestoreDatasetStats;
  collectionOspManualReconciliations: RestoreDatasetStats;
  collectionOspManualReconciliationAudit: RestoreDatasetStats;
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

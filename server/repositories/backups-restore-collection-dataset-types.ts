export type RestorableCollectionRecordRow = {
  id: string;
  customerName: string;
  customerNameSearchHashes: string[] | null;
  icNumber: string;
  customerPhone: string;
  accountNumber: string;
  cardNumberLast4: string | null;
  sourceImportId: string | null;
  sourceDataRowId: string | null;
  sourceImportName: string | null;
  sourceFilename: string | null;
  agingBucket: "D3" | "D4" | "D5" | "D6" | null;
  totalDue: number | null;
  billingPrincipalOsp: number | null;
  callingDate: string | null;
  callingWindowEndExclusive: string | null;
  sourceMatchBasis:
    | "ic"
    | "phone_and_account"
    | "account_number"
    | "card_number"
    | "account_and_card"
    | null;
  sourceMatchAccuracy: number | null;
  sourceObligationKey: string | null;
  settlementCycleKey: string | null;
  classification: "cp" | "abort_cp" | null;
  cumulativeCollected: number | null;
  remainingAmount: number | null;
  batch: string;
  paymentDate: string;
  amount: number;
  receiptFile: string | null;
  receiptTotalAmount: number;
  receiptValidationStatus: string;
  receiptValidationMessage: string | null;
  receiptCount: number;
  duplicateReceiptFlag: boolean;
  createdByLogin: string;
  collectionStaffNickname: string;
  staffUsername: string;
  createdAt: Date;
};

export type RestorableCollectionSourceConfigRow = {
  sourceImportId: string;
  validFrom: string;
  validTo: string;
  cycleKey: string;
  enabled: boolean;
  compatibilityStatus: "compatible" | "incompatible";
  compatibilityIssues: string[];
  indexedRowCount: number;
  configuredBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export type RestorableCollectionSourceRow = {
  sourceImportId: string;
  sourceDataRowId: string;
  accountNumberHash: string | null;
  cardNumberHash: string | null;
  cardNumberLast4: string | null;
  canonicalObligationKey: string;
  totalDue: number;
  billingPrincipalOsp: number;
  totalOsb: number | null;
  agingBucket: "D3" | "D4" | "D5" | "D6";
  callingDate: string;
  createdAt: Date;
};

export type RestorableCollectionOspTargetRow = {
  id: string;
  sourceScopeHash: string;
  sourceImportIds: string[];
  periodFrom: string;
  periodTo: string;
  agingBucket: "D3" | "D4" | "D5" | "D6";
  totalOspBaseline: number | null;
  targetPercentage: number;
  configuredBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export type RestorableCollectionReceiptRow = {
  id: string;
  collectionRecordId: string;
  storagePath: string;
  originalFileName: string;
  originalMimeType: string;
  originalExtension: string;
  fileSize: number;
  receiptAmount: number | null;
  extractedAmount: number | null;
  extractionStatus: string;
  extractionConfidence: number | null;
  receiptDate: string | null;
  receiptReference: string | null;
  fileHash: string | null;
  createdAt: Date;
};

export type RestorableCollectionRecordPurgeHistoryRow = {
  id: string;
  sourceImportId: string | null;
  sourceDataRowId: string | null;
  sourceImportName: string | null;
  sourceFilename: string | null;
  icNumberSearchHash: string | null;
  customerPhoneSearchHash: string | null;
  accountNumberSearchHash: string | null;
  paymentDate: string;
  amount: number;
  createdByLogin: string;
  collectionStaffNickname: string;
  originalCreatedAt: Date;
  purgedAt: Date;
  purgedBy: string;
  purgeReason: "retention_policy";
};

export type RestorableCollectionOspSavedTargetRow = {
  id: string;
  targetName: string;
  normalizedName: string;
  description: string | null;
  status: "ACTIVE" | "DELETED";
  version: number;
  createdBy: string;
  createdAt: Date;
  updatedBy: string;
  updatedAt: Date;
  deletedBy: string | null;
  deletedAt: Date | null;
};

export type RestorableCollectionOspTargetRevisionRow = {
  id: string;
  targetId: string;
  revisionNumber: number;
  sourceScopeHash: string;
  periodFrom: string;
  periodTo: string;
  trackingStartDate: string;
  trackingEndDate: string | null;
  timezone: string;
  nicknameScope: string[];
  agingScope: Array<"D3" | "D4" | "D5" | "D6">;
  calculationVersion: string;
  createdBy: string;
  createdAt: Date;
};

export type RestorableCollectionOspTargetSourceRow = {
  targetRevisionId: string;
  sourceImportId: string;
  sourceNameSnapshot: string;
  sourceFilenameSnapshot: string;
  sourceVersionSnapshot: string | null;
  sourceContentHashSnapshot: string | null;
  createdAt: Date;
};

export type RestorableCollectionOspTargetSourceSnapshotRow = {
  targetRevisionId: string;
  sourceImportId: string;
  sourceDataRowId: string;
  canonicalObligationKey: string;
  cycleKey: string;
  accountNumberEncrypted: string | null;
  accountNumberSearchHash: string | null;
  cardNumberLast4: string | null;
  customerNameEncrypted: string | null;
  customerNameSearchHashes: string[] | null;
  agingBucket: "D3" | "D4" | "D5" | "D6";
  callingDate: string;
  callingWindowEndExclusive: string;
  totalDue: string;
  billingPrincipalOsp: string;
  createdAt: Date;
};

export type RestorableCollectionOspTargetAgingRow = {
  targetRevisionId: string;
  agingBucket: "D3" | "D4" | "D5" | "D6";
  totalOspBaseline: string;
  targetPercentage: string;
  targetOsp: string;
  createdAt: Date;
};

export type RestorableCollectionOspClientResultRow = {
  id: string;
  targetId: string;
  targetRevisionId: string;
  asOfDate: string;
  agingBucket: "D3" | "D4" | "D5" | "D6" | "ALL";
  resultPercentage: string;
  ospClosed: string;
  clientReference: string | null;
  note: string | null;
  version: number;
  createdBy: string;
  createdAt: Date;
  updatedBy: string;
  updatedAt: Date;
};

export type RestorableCollectionOspManualReconciliationRow = {
  id: string;
  targetId: string;
  targetRevisionId: string;
  sourceImportId: string;
  sourceDataRowId: string;
  canonicalObligationKey: string;
  cycleKey: string;
  accountNumberEncrypted: string | null;
  accountNumberSearchHash: string | null;
  cardNumberLast4: string | null;
  customerNameEncrypted: string | null;
  customerNameSearchHashes: string[] | null;
  agingBucket: "D3" | "D4" | "D5" | "D6";
  callingDate: string;
  callingWindowEndExclusive: string;
  totalDue: string;
  billingPrincipalOsp: string;
  manualPriorAmount: string;
  manualAsOfDate: string;
  actualPaymentDate: string | null;
  dateSource: "ACTUAL_PAYMENT_DATE" | "CLIENT_AS_OF" | "MANUAL_AS_OF";
  reasonCode:
    | "PRIOR_PAYMENT_NOT_IN_SYSTEM"
    | "CLIENT_CONFIRMED_PRIOR_PAYMENT"
    | "HISTORICAL_PAYMENT_MISSING"
    | "MIGRATED_HISTORY_GAP"
    | "OTHER_WITH_REQUIRED_NOTE";
  note: string | null;
  evidenceReference: string | null;
  status: "ACTIVE" | "VOIDED";
  version: number;
  createdBy: string;
  createdAt: Date;
  updatedBy: string;
  updatedAt: Date;
  voidedBy: string | null;
  voidedAt: Date | null;
  voidReason: string | null;
};

export type RestorableCollectionOspManualReconciliationAuditRow = {
  id: string;
  reconciliationId: string;
  targetId: string;
  targetRevisionId: string;
  operation: "CREATE" | "UPDATE" | "VOID" | "RESTORE";
  fromVersion: number | null;
  toVersion: number;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown>;
  actorUsername: string;
  actorRole: "superuser";
  requestId: string | null;
  createdAt: Date;
};

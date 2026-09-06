import type {
  CollectionAmountCents,
  CollectionAmountMyrNumber,
  CollectionAmountMyrString,
} from "../shared/collection-amount-types";
import type {
  CollectionDailyCalendarStatus,
  CollectionDailyLeaveType,
} from "../shared/collection-daily-status";

export type CollectionBatch = "P10" | "P25" | "MDD02" | "MDD10" | "MDD18" | "MDD25";
export type CollectionAgingBucket = "D3" | "D4" | "D5" | "D6";
export type CollectionCpStatus = "cp" | "abort_cp" | "unverified";
export type CollectionManualSettlementStatus = "ACTIVE" | "REVOKED";
export type CollectionManualSettlementValidity =
  | "EFFECTIVE"
  | "REQUIRES_REVALIDATION"
  | "SUPERSEDED_BY_AUTOMATIC"
  | "REVOKED";
export type CollectionEffectiveSettlementSource = "AUTOMATIC" | "MANUAL_VERIFIED" | "NONE";
export type CollectionManualSettlementReason =
  | "EXTERNAL_UNASSIGNED_PAYMENT"
  | "CLIENT_CONFIRMED_PAYMENT"
  | "HISTORICAL_PAYMENT_NOT_CAPTURED"
  | "OTHER_WITH_REQUIRED_NOTE";

export type CollectionManualSettlement = {
  status: CollectionManualSettlementStatus;
  validity: CollectionManualSettlementValidity;
  poolAmount: CollectionAmountMyrString;
  settlementDate: string;
  reason: CollectionManualSettlementReason;
  note: string | null;
  reference: string | null;
  version: number;
  verifiedBy: string;
  verifiedAt: Date;
  updatedBy: string;
  updatedAt: Date;
  revokedBy: string | null;
  revokedAt: Date | null;
  revokedReason: string | null;
  systemCollectedAtSettlement: CollectionAmountMyrString;
  effectiveTotal: CollectionAmountMyrString;
};
export type CollectionSourceMatchBasis =
  | "ic"
  | "phone_and_account"
  | "account_number"
  | "card_number"
  | "account_and_card";

export type CollectionReceiptValidationStatus =
  | "matched"
  | "underpaid"
  | "overpaid"
  | "unverified"
  | "needs_review";

export type CollectionReceiptExtractionStatus =
  | "unprocessed"
  | "suggested"
  | "ambiguous"
  | "unavailable"
  | "error";

export type CollectionReceiptDuplicateMatch = {
  receiptId: string;
  collectionRecordId: string;
  originalFileName: string;
  createdAt: Date;
};

export type CollectionReceiptDuplicateSummary = {
  fileHash: string;
  matchCount: number;
  matches: CollectionReceiptDuplicateMatch[];
};

export type CollectionRecordReceipt = {
  id: string;
  collectionRecordId: string;
  storagePath: string;
  originalFileName: string;
  originalMimeType: string;
  originalExtension: string;
  fileSize: number;
  receiptAmount: CollectionAmountMyrString | null;
  extractedAmount: CollectionAmountMyrString | null;
  extractionStatus: CollectionReceiptExtractionStatus;
  extractionConfidence: number | null;
  receiptDate: string | null;
  receiptReference: string | null;
  fileHash: string | null;
  createdAt: Date;
  deletedAt?: Date | null;
};

export type CollectionRecord = {
  id: string;
  customerName: string;
  icNumber: string;
  customerPhone: string;
  accountNumber: string;
  /**
   * Full Card No recovered only from the record's exact governed Saved-row
   * link after its blind index and obligation identity have been verified.
   * It is intentionally not persisted on collection_records.
   */
  cardNumber?: string | null;
  cardNumberLast4?: string | null;
  sourceImportId?: string | null;
  sourceDataRowId?: string | null;
  sourceImportName?: string | null;
  sourceFilename?: string | null;
  agingBucket?: CollectionAgingBucket | null;
  callingDate?: string | null;
  callingWindowEnd?: string | null;
  callingWindowEndExclusive?: string | null;
  totalDue?: CollectionAmountMyrString | null;
  billingPrincipalOsp?: CollectionAmountMyrString | null;
  sourceMatchBasis?: CollectionSourceMatchBasis | null;
  sourceMatchAccuracy?: number | null;
  sourceObligationKey?: string | null;
  settlementCycleKey?: string | null;
  totalDueCovered?: boolean | null;
  cumulativeCollected?: CollectionAmountMyrString | null;
  remainingAmount?: CollectionAmountMyrString | null;
  cpStatus?: CollectionCpStatus;
  automaticCpStatus?: CollectionCpStatus;
  effectiveSettlementSource?: CollectionEffectiveSettlementSource;
  effectiveSettlementDate?: string | null;
  manualSettlement?: CollectionManualSettlement | null;
  batch: CollectionBatch;
  paymentDate: string;
  amount: CollectionAmountMyrString;
  receiptFile: string | null;
  receipts: CollectionRecordReceipt[];
  archivedReceipts?: CollectionRecordReceipt[];
  receiptTotalAmount: CollectionAmountMyrString;
  receiptValidationStatus: CollectionReceiptValidationStatus;
  receiptValidationMessage: string | null;
  receiptCount: number;
  duplicateReceiptFlag: boolean;
  createdByLogin: string;
  collectionStaffNickname: string;
  createdAt: Date;
  updatedAt?: Date;
};

export type CollectionRecordAggregate = {
  totalRecords: number;
  totalAmount: CollectionAmountMyrNumber;
};

export type CollectionRecordListFilters = {
  from?: string | undefined;
  to?: string | undefined;
  search?: string | undefined;
  createdByLogin?: string | undefined;
  nicknames?: string[] | undefined;
  receiptValidationStatus?: CollectionReceiptValidationStatus | "flagged" | undefined;
  duplicateOnly?: boolean | undefined;
  sourceImportIds?: string[] | undefined;
  agingBuckets?: CollectionAgingBucket[] | undefined;
  classifications?: Array<"cp" | "abort_cp"> | undefined;
  sortBy?: "paymentDate" | "amount" | "customerName" | "source" | "aging" | "classification" | undefined;
  sortDirection?: "asc" | "desc" | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
};

export type CollectionSourceConfigStatus = "active" | "upcoming" | "expired" | "disabled" | "incompatible";

export type CollectionSourceConfig = {
  sourceImportId: string;
  sourceImportName: string;
  sourceFilename: string;
  rowCount: number;
  validFrom: string;
  validTo: string;
  cycleKey: string;
  enabled: boolean;
  compatibilityStatus: "compatible" | "incompatible";
  compatibilityIssues: string[];
  indexedRowCount: number;
  configuredBy: string;
  configuredAt: Date;
  updatedAt: Date;
  status: CollectionSourceConfigStatus;
};

export type ConfigureCollectionSourceInput = {
  sourceImportId: string;
  validFrom: string;
  validTo: string;
  enabled: boolean;
  configuredBy: string;
};

export type CollectionLegacyBackfillReason =
  | "incomplete_source_link"
  | "missing_source_row"
  | "source_not_authorized"
  | "outside_source_validity"
  | "account_match_unavailable"
  | "account_mismatch"
  | "ambiguous_account_match"
  | "incomplete_trusted_source"
  | "snapshot_conflict"
  | "concurrent_change"
  | "settlement_conflict";

export type CollectionLegacyBackfillStats = {
  scannedRecords: number;
  backfilledRecords: number;
  unresolvedRecords: number;
  recalculatedCycles: number;
  reasonCounts: Partial<Record<CollectionLegacyBackfillReason, number>>;
};

export type CollectionIndexedSourceMatch = {
  sourceImportId: string;
  sourceDataRowId: string;
  sourceImportName: string;
  sourceFilename: string;
  sourceObligationKey: string;
  settlementCycleKey: string;
  cardNumberLast4: string | null;
  matchBasis: "account_number" | "card_number" | "account_and_card";
  totalDue: CollectionAmountMyrString;
  billingPrincipalOsp: CollectionAmountMyrString;
  totalOsb: CollectionAmountMyrString | null;
  agingBucket: CollectionAgingBucket;
  callingDate: string;
  callingWindowEnd: string;
  callingWindowEndExclusive: string;
  duplicateSourceCount: number;
};

export type CollectionSourceMatchResult = {
  eligibleSourceCount: number;
  matches: CollectionIndexedSourceMatch[];
};

export type CollectionBillingPrincipalAgingRow = {
  aging: CollectionAgingBucket;
  totalOsp: CollectionAmountMyrString;
  targetPercentage: string;
  targetOsp: CollectionAmountMyrString;
  resultPercentage: string;
  ospClosed: CollectionAmountMyrString;
  closedAccountCount: number;
};

export type CollectionBillingPrincipalReport = {
  rows: CollectionBillingPrincipalAgingRow[];
  all: Omit<CollectionBillingPrincipalAgingRow, "aging"> & { aging: "ALL" };
};

export type CollectionOspTargetInput = {
  agingBucket: CollectionAgingBucket;
  totalOspBaseline: string | null;
  targetPercentage: string;
};

export type CollectionOspSavedTargetStatus = "ACTIVE" | "DELETED";
export type CollectionOspManualReconciliationStatus = "ACTIVE" | "VOIDED";
export type CollectionOspManualDateSource = "ACTUAL_PAYMENT_DATE" | "CLIENT_AS_OF" | "MANUAL_AS_OF";
export type CollectionOspManualReasonCode =
  | "PRIOR_PAYMENT_NOT_IN_SYSTEM"
  | "CLIENT_CONFIRMED_PRIOR_PAYMENT"
  | "HISTORICAL_PAYMENT_MISSING"
  | "MIGRATED_HISTORY_GAP"
  | "OTHER_WITH_REQUIRED_NOTE";

export type CollectionOspTargetSourceSnapshot = {
  sourceImportId: string;
  sourceName: string;
  sourceFilename: string;
  sourceVersion: string;
  sourceContentHash: string | null;
};

export type CollectionOspTargetAgingSnapshot = {
  agingBucket: CollectionAgingBucket;
  totalOspBaseline: CollectionAmountMyrString;
  targetPercentage: string;
  targetOsp: CollectionAmountMyrString;
};

export type CollectionOspSavedTarget = {
  id: string;
  name: string;
  description: string | null;
  status: CollectionOspSavedTargetStatus;
  version: number;
  revisionId: string;
  revisionNumber: number;
  sourceScopeHash: string;
  periodFrom: string;
  periodTo: string;
  trackingStartDate: string;
  trackingEndDate: string;
  timezone: string;
  nicknameScope: string[];
  agingScope: CollectionAgingBucket[];
  calculationVersion: string;
  sources: CollectionOspTargetSourceSnapshot[];
  agingRows: CollectionOspTargetAgingSnapshot[];
  createdBy: string;
  createdAt: Date;
  updatedBy: string;
  updatedAt: Date;
};

export type CreateCollectionOspSavedTargetInput = {
  name: string;
  description?: string | null;
  sourceImportIds: string[];
  from: string;
  to: string;
  trackingStartDate: string;
  trackingEndDate: string;
  timezone: string;
  nicknameScope: string[];
  agingScope: CollectionAgingBucket[];
  targets: CollectionOspTargetInput[];
  actor: string;
};

export type CollectionOspClientResult = {
  id: string;
  targetId: string;
  targetRevisionId: string;
  asOfDate: string;
  agingBucket: CollectionAgingBucket;
  resultPercentage: string;
  ospClosed: CollectionAmountMyrString;
  clientReference: string | null;
  note: string | null;
  version: number;
  createdBy: string;
  createdAt: Date;
  updatedBy: string;
  updatedAt: Date;
};

export type CollectionOspReconciliationCandidate = {
  sourceImportId: string;
  sourceDataRowId: string;
  sourceName: string;
  sourceFilename: string;
  accountNumberMasked: string;
  cardNumberLast4: string | null;
  customerName: string;
  canonicalObligationKey: string;
  cycleKey: string;
  agingBucket: CollectionAgingBucket;
  callingDate: string;
  callingWindowEndExclusive: string;
  totalDue: CollectionAmountMyrString;
  billingPrincipalOsp: CollectionAmountMyrString;
  systemCumulative: CollectionAmountMyrString;
  hasSystemAbort: boolean;
  activeReconciliationId: string | null;
};

export type CollectionOspManualReconciliation = {
  id: string;
  targetId: string;
  targetRevisionId: string;
  sourceImportId: string;
  sourceDataRowId: string;
  sourceName: string;
  sourceFilename: string;
  accountNumberMasked: string;
  cardNumberLast4: string | null;
  customerName: string;
  canonicalObligationKey: string;
  cycleKey: string;
  agingBucket: CollectionAgingBucket;
  callingDate: string;
  callingWindowEndExclusive: string;
  totalDue: CollectionAmountMyrString;
  billingPrincipalOsp: CollectionAmountMyrString;
  manualPriorAmount: CollectionAmountMyrString;
  manualAsOfDate: string;
  actualPaymentDate: string | null;
  dateSource: CollectionOspManualDateSource;
  reasonCode: CollectionOspManualReasonCode;
  note: string | null;
  evidenceReference: string | null;
  status: CollectionOspManualReconciliationStatus;
  version: number;
  systemCumulative: CollectionAmountMyrString;
  reconciledCumulative: CollectionAmountMyrString;
  remainingAmount: CollectionAmountMyrString;
  qualifiesAsClosed: boolean;
  effectiveClosureDate: string | null;
  contributionSource: "SYSTEM_ABORT_CP" | "MANUAL_RECONCILIATION" | "OPEN";
  manualSuperseded: boolean;
  createdBy: string;
  createdAt: Date;
  updatedBy: string;
  updatedAt: Date;
  voidedBy: string | null;
  voidedAt: Date | null;
  voidReason: string | null;
};

export type CollectionOspReconciliationAuditEntry = {
  id: string;
  reconciliationId: string;
  operation: "create" | "update" | "void" | "restore";
  fromVersion: number | null;
  toVersion: number;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  actorUsername: string;
  actorRole: string;
  createdAt: Date;
};

export type CollectionOspResultSummary = {
  rows: CollectionBillingPrincipalAgingRow[];
  all: Omit<CollectionBillingPrincipalAgingRow, "aging"> & { aging: "ALL" };
};

export type CollectionOspTargetOverview = {
  target: CollectionOspSavedTarget;
  asOfDate: string;
  system: CollectionOspResultSummary;
  reconciled: CollectionOspResultSummary;
  clientResults: CollectionOspClientResult[];
  comparison: Array<{
    aging: CollectionAgingBucket | "ALL";
    systemOspClosed: CollectionAmountMyrString;
    clientOspClosed: CollectionAmountMyrString | null;
    reconciledOspClosed: CollectionAmountMyrString;
    systemVsClientDelta: CollectionAmountMyrString | null;
    reconciledVsClientDelta: CollectionAmountMyrString | null;
  }>;
};

export type CollectionOspCalendarDay = {
  date: string;
  systemDailyOsp: CollectionAmountMyrString;
  manualDailyOsp: CollectionAmountMyrString;
  reconciledDailyOsp: CollectionAmountMyrString;
  systemCumulativeOsp: CollectionAmountMyrString;
  manualCumulativeOsp: CollectionAmountMyrString;
  reconciledCumulativeOsp: CollectionAmountMyrString;
  systemDailyAccounts: number;
  manualDailyAccounts: number;
  reconciledDailyAccounts: number;
};

export type CollectionOspSavedTargetRevisionView = {
  id: string;
  revisionNumber: number;
  /** False/absent for legacy caller-selected periods; never infer from today's source configuration. */
  sourceValidityVerified?: boolean;
  from: string;
  to: string;
  trackingStartDate: string | null;
  trackingEndDate: string | null;
  sourceImportIds: string[];
  sourceSnapshots: Array<{
    sourceImportId: string;
    name: string;
    filename: string | null;
  }>;
  nicknameScope: string[];
  agingScope: CollectionAgingBucket[];
  createdAt: string;
};

export type CollectionOspSavedTargetView = {
  id: string;
  assignedAdminUserId: string | null;
  assignedAdmin: { id: string; username: string; fullName: string | null } | null;
  name: string;
  description: string | null;
  status: CollectionOspSavedTargetStatus;
  version: number;
  activeRevision: CollectionOspSavedTargetRevisionView;
  createdAt: string;
  updatedAt: string;
};

/** Only construct from the authenticated session, never request JSON. */
export type CollectionOspViewer = { userId: string; role: string };

export type CollectionOspTargetOptionsInput = {
  viewer: CollectionOspViewer;
  sourceSearch: string;
  adminSearch: string;
  sourcePage: number;
  adminPage: number;
  pageSize: number;
};
export type CollectionOspTargetOptions = {
  admins: Array<{ id: string; username: string; fullName: string | null }>;
  sources: Array<{ id: string; name: string; filename: string; validFrom: string; validTo: string; recordCount: number; status: "active" }>;
  adminsHasMore: boolean;
  sourcesHasMore: boolean;
  pageSize: number;
};
export type CollectionOspSourcePreview = {
  from: string;
  to: string;
  sourceImportIds: string[];
  rows: Array<{ aging: CollectionAgingBucket; totalOsp: string; accountCount: number }>;
};

export type CollectionOspClientResultView = {
  aging: CollectionAgingBucket;
  totalOsp: string;
  targetPercentage: string;
  targetOsp: string;
  resultPercentage: string;
  ospClosed: string;
  balanceOsp: string;
  note: string | null;
  reference: string | null;
  receivedDate: string | null;
  updatedAt: string | null;
  version: number | null;
};

export type CollectionOspClientResultTableView = {
  rows: CollectionOspClientResultView[];
  all: Omit<CollectionOspClientResultView, "aging"> & { aging: "ALL" };
};

export type CollectionOspManualReconciliationView = {
  id: string;
  version: number;
  status: CollectionOspManualReconciliationStatus;
  sourceImportId: string;
  sourceRecordId: string;
  sourceName: string;
  sourceFilename: string;
  maskedAccountNumber: string;
  cardNumberLast4: string | null;
  maskedCustomerName: string;
  aging: CollectionAgingBucket;
  callingDate: string;
  totalDue: string;
  billingPrincipalOsp: string;
  systemEligibleCumulative: string;
  rawSystemClassification: "CP" | "ABORT_CP" | null;
  manualPriorAmount: string;
  asOfDate: string;
  actualPaymentDate: string | null;
  reconciledCumulative: string;
  reconciledRemaining: string;
  reconciledStatus: "RECONCILED_CLOSED" | "RECONCILED_OPEN" | "SUPERSEDED_BY_SYSTEM_ABORT";
  reconciledClosedEffectiveDate: string | null;
  reason: CollectionOspManualReasonCode;
  note: string | null;
  reference: string | null;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
};

export type CollectionOspPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type CollectionOspReconciliationCandidateView = {
  sourceImportId: string;
  sourceRecordId: string;
  sourceName: string;
  sourceFilename: string;
  maskedAccountNumber: string;
  cardNumberLast4: string | null;
  maskedCustomerName: string;
  aging: CollectionAgingBucket;
  callingDate: string;
  totalDue: string;
  billingPrincipalOsp: string;
  systemEligibleCumulative: string;
  rawSystemClassification: "CP" | "ABORT_CP" | null;
  activeReconciliationId: string | null;
};

export type CollectionOspReconciliationHistoryView = {
  id: string;
  operation: "CREATE" | "UPDATE" | "VOID" | "RESTORE";
  fromVersion: number | null;
  toVersion: number;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  actor: string;
  createdAt: string;
};

export type CollectionOspCalendarDayView = {
  date: string;
  aging: CollectionAgingBucket | "ALL";
  totalOsp: string;
  targetOsp: string;
  balanceOsp: string;
  systemOspClosedToday: string;
  systemCumulativeOspClosed: string;
  systemResultPercentage: string;
  systemPreviousResultPercentage: string;
  systemDailyMovementPercentagePoints: string;
  systemAchievementVsTargetPercentage: string;
  systemDailyAccounts: number;
};

export type CollectionOspDrilldownItemView = {
  contributionSource: "AUTOMATIC_ABORT_CP" | "MANUAL_VERIFIED_ABORT";
  accountNumber: string | null;
  customerName: string | null;
  identificationNumber: string | null;
  phone: string | null;
  paymentDate: string;
  classification: "ABORT_CP" | "MANUAL_VERIFIED_ABORT";
  maskedAccountNumber: string;
  cardNumber: string | null;
  cardNumberLast4: string | null;
  maskedCustomerName: string;
  sourceName: string;
  sourceFilename: string;
  callingDate: string;
  aging: CollectionAgingBucket;
  totalDue: string;
  systemEligibleCumulative: string;
  systemClosureCollectionAmount: string | null;
  systemClosureStaffNickname: string | null;
  poolAmount: string;
  effectiveCumulative: string;
  billingPrincipalOsp: string;
  effectiveClosedDate: string;
  reason: string | null;
  reference: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
};

export type CollectionRecordAggregateFilters = Omit<
  CollectionRecordListFilters,
  "limit" | "offset"
>;

export type CollectionNicknameAggregate = {
  nickname: string;
  totalRecords: number;
  totalAmount: CollectionAmountMyrNumber;
};

export type CollectionNicknameDailyAggregate = {
  nickname: string;
  paymentDate: string;
  totalRecords: number;
  totalAmount: CollectionAmountMyrNumber;
};

export type CollectionMonthlySummary = {
  month: number;
  monthName: string;
  totalRecords: number;
  totalAmount: CollectionAmountMyrNumber;
};

export type CollectionMonthlyComparisonAggregate = {
  year: number;
  month: number;
  totalRecords: number;
  totalAmount: CollectionAmountMyrNumber;
};

export type CollectionRollupFreshnessSnapshot = {
  status: "fresh" | "warming" | "stale";
  pendingCount: number;
  runningCount: number;
  retryCount: number;
  oldestPendingAgeMs: number;
};

export type CollectionStaffNickname = {
  id: string;
  nickname: string;
  isActive: boolean;
  roleScope: "admin" | "user" | "both";
  createdBy: string | null;
  createdAt: Date;
};

export type CollectionNicknameAuthProfile = {
  id: string;
  nickname: string;
  isActive: boolean;
  roleScope: "admin" | "user" | "both";
  mustChangePassword: boolean;
  passwordResetBySuperuser: boolean;
  nicknamePasswordHash: string | null;
  passwordUpdatedAt: Date | null;
};

export type CollectionAdminUser = {
  id: string;
  username: string;
  role: "admin";
  isBanned: boolean | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CollectionAdminGroup = {
  id: string;
  leaderNickname: string;
  leaderNicknameId: string | null;
  leaderIsActive: boolean;
  leaderRoleScope: "admin" | "user" | "both" | null;
  memberNicknames: string[];
  memberNicknameIds: string[];
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CollectionNicknameSession = {
  activityId: string;
  username: string;
  userRole: string;
  nickname: string;
  verifiedAt: Date;
  updatedAt: Date;
};

export type CollectionDailyUser = {
  id: string;
  username: string;
  role: string;
};

export type CollectionDailyTarget = {
  id: string;
  username: string;
  year: number;
  month: number;
  monthlyTarget: CollectionAmountMyrNumber;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CollectionDailyCalendarDay = {
  id: string;
  username: string;
  date: string;
  year: number;
  month: number;
  day: number;
  status: CollectionDailyCalendarStatus;
  leaveType: CollectionDailyLeaveType | null;
  note: string | null;
  isWorkingDay: boolean;
  isHoliday: boolean;
  holidayName: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CollectionDailyCalendarAuditEntry = {
  id: string;
  calendarId: string | null;
  username: string;
  date: string;
  year: number;
  month: number;
  day: number;
  action: "CREATE" | "UPDATE" | "DELETE";
  oldStatus: CollectionDailyCalendarStatus | null;
  newStatus: CollectionDailyCalendarStatus | null;
  oldLeaveType: CollectionDailyLeaveType | null;
  newLeaveType: CollectionDailyLeaveType | null;
  oldNote: string | null;
  newNote: string | null;
  oldHolidayName: string | null;
  newHolidayName: string | null;
  actor: string | null;
  createdAt: Date;
};

export type CollectionDailyPaidCustomer = {
  id: string;
  customerName: string;
  accountNumber: string;
  amount: CollectionAmountMyrNumber;
  collectionStaffNickname: string;
};

export type CreateCollectionRecordInput = {
  customerName: string;
  icNumber: string;
  customerPhone: string;
  accountNumber: string;
  /** Ephemeral matching input. Never persisted or returned. */
  sourceCardNumber?: string | null;
  cardNumberLast4?: string | null;
  sourceImportId?: string | null;
  sourceDataRowId?: string | null;
  sourceImportName?: string | null;
  sourceFilename?: string | null;
  agingBucket?: CollectionAgingBucket | null;
  callingDate?: string | null;
  callingWindowEndExclusive?: string | null;
  totalDue?: CollectionAmountMyrNumber | null;
  billingPrincipalOsp?: CollectionAmountMyrNumber | null;
  sourceMatchBasis?: CollectionSourceMatchBasis | null;
  sourceMatchAccuracy?: number | null;
  sourceObligationKey?: string | null;
  settlementCycleKey?: string | null;
  batch: CollectionBatch;
  paymentDate: string;
  amount: CollectionAmountMyrNumber;
  receiptFile?: string | null;
  createdByLogin: string;
  collectionStaffNickname: string;
};

export type CreateCollectionRecordReceiptInput = {
  storagePath: string;
  originalFileName: string;
  originalMimeType: string;
  originalExtension: string;
  fileSize: number;
  receiptAmountCents?: CollectionAmountCents | null | undefined;
  extractedAmountCents?: CollectionAmountCents | null | undefined;
  extractionStatus?: CollectionReceiptExtractionStatus | null | undefined;
  extractionConfidence?: number | null | undefined;
  receiptDate?: string | null | undefined;
  receiptReference?: string | null | undefined;
  fileHash?: string | null | undefined;
};

export type UpdateCollectionRecordReceiptInput = {
  receiptId: string;
  receiptAmountCents?: CollectionAmountCents | null | undefined;
  extractedAmountCents?: CollectionAmountCents | null | undefined;
  extractionStatus?: CollectionReceiptExtractionStatus | null | undefined;
  extractionConfidence?: number | null | undefined;
  receiptDate?: string | null | undefined;
  receiptReference?: string | null | undefined;
};

export type UpdateCollectionRecordInput = {
  customerName?: string;
  icNumber?: string;
  customerPhone?: string;
  accountNumber?: string;
  /** Ephemeral matching input. Never persisted or returned. */
  sourceCardNumber?: string | null;
  cardNumberLast4?: string | null;
  sourceImportId?: string | null;
  sourceDataRowId?: string | null;
  sourceImportName?: string | null;
  sourceFilename?: string | null;
  agingBucket?: CollectionAgingBucket | null;
  callingDate?: string | null;
  callingWindowEndExclusive?: string | null;
  totalDue?: CollectionAmountMyrNumber | null;
  billingPrincipalOsp?: CollectionAmountMyrNumber | null;
  sourceMatchBasis?: CollectionSourceMatchBasis | null;
  sourceMatchAccuracy?: number | null;
  sourceObligationKey?: string | null;
  settlementCycleKey?: string | null;
  batch?: CollectionBatch;
  paymentDate?: string;
  amount?: CollectionAmountMyrNumber;
  receiptFile?: string | null;
  collectionStaffNickname?: string;
};

export type UpdateCollectionRecordOptions = {
  expectedUpdatedAt?: Date | undefined;
  removeAllReceipts?: boolean | undefined;
  removeReceiptIds?: string[] | undefined;
  newReceipts?: CreateCollectionRecordReceiptInput[] | undefined;
  receiptUpdates?: UpdateCollectionRecordReceiptInput[] | undefined;
};

export type DeleteCollectionRecordOptions = {
  expectedUpdatedAt?: Date | undefined;
};

export type MutationIdempotencyAcquireInput = {
  scope: string;
  actor: string;
  idempotencyKey: string;
  requestFingerprint?: string | null;
};

export type MutationIdempotencyAcquireResult =
  | { status: "acquired" }
  | {
      status: "replay";
      responseStatus: number;
      responseBody: unknown;
    }
  | { status: "in_progress" }
  | { status: "payload_mismatch" };

export type MutationIdempotencyCompleteInput = {
  scope: string;
  actor: string;
  idempotencyKey: string;
  responseStatus: number;
  responseBody: unknown;
};

export type CreateCollectionStaffNicknameInput = {
  nickname: string;
  createdBy: string;
  roleScope?: "admin" | "user" | "both";
};

export type UpdateCollectionStaffNicknameInput = {
  nickname?: string;
  isActive?: boolean;
  roleScope?: "admin" | "user" | "both";
};

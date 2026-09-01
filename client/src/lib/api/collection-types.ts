import type {
  CollectionAmountMyrLike,
  CollectionAmountMyrNumber,
  CollectionAmountMyrString,
} from "@shared/collection-amount-types";
import type {
  CollectionDailyCalendarStatus,
  CollectionDailyLeaveType,
} from "@shared/collection-daily-status";

export type CollectionBatch = "P10" | "P25" | "MDD02" | "MDD10" | "MDD18" | "MDD25";
export type CollectionAgingBucket = "D3" | "D4" | "D5" | "D6";
export type CollectionCpStatus = "cp" | "abort_cp" | "unverified";

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
  createdAt: string;
  deletedAt?: string | null;
};

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

export type CollectionRecord = {
  id: string;
  customerName: string;
  icNumber: string;
  customerPhone: string;
  accountNumber: string;
  cardNumberLast4?: string | null;
  sourceImportId?: string | null;
  sourceDataRowId?: string | null;
  sourceImportName?: string | null;
  sourceFilename?: string | null;
  agingBucket?: CollectionAgingBucket | null;
  totalDue?: CollectionAmountMyrString | null;
  billingPrincipalOsp?: CollectionAmountMyrString | null;
  sourceMatchBasis?:
    | "ic"
    | "phone_and_account"
    | "account_number"
    | "card_number"
    | "account_and_card"
    | null;
  sourceMatchAccuracy?: number | null;
  callingDate?: string | null;
  callingWindowEnd?: string | null;
  callingWindowEndExclusive?: string | null;
  cumulativeCollected?: CollectionAmountMyrString | null;
  remainingAmount?: CollectionAmountMyrString | null;
  totalDueCovered?: boolean | null;
  cpStatus?: CollectionCpStatus;
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
  createdAt: string;
  updatedAt?: string;
};

export type CollectionStaffNickname = {
  id: string;
  nickname: string;
  isActive: boolean;
  roleScope: "admin" | "user" | "both";
  createdBy: string | null;
  createdAt: string;
};

export type CollectionAdminUser = {
  id: string;
  username: string;
  role: "admin";
  isBanned: boolean | null;
  createdAt: string;
  updatedAt: string;
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
  createdAt: string;
  updatedAt: string;
};

export type CollectionReceiptPayload = {
  fileName: string;
  mimeType: string;
  contentBase64: string;
};

export type CollectionReceiptMetadata = {
  receiptId?: string | undefined;
  receiptAmount?: CollectionAmountMyrLike | null | undefined;
  extractedAmount?: CollectionAmountMyrLike | null | undefined;
  extractionStatus?: CollectionReceiptExtractionStatus | null | undefined;
  extractionConfidence?: number | string | null | undefined;
  receiptDate?: string | null | undefined;
  receiptReference?: string | null | undefined;
  fileHash?: string | null | undefined;
};

export type CreateCollectionPayload = {
  customerName: string;
  icNumber: string;
  customerPhone: string;
  accountNumber: string;
  cardNumber?: string;
  sourceImportId?: string;
  agingBucket?: CollectionAgingBucket;
  batch: CollectionBatch;
  paymentDate: string;
  amount: CollectionAmountMyrNumber;
  collectionStaffNickname: string;
  receipt?: CollectionReceiptPayload | null;
  receipts?: CollectionReceiptPayload[] | null;
  newReceiptMetadata?: CollectionReceiptMetadata[] | null;
};

export type CollectionSourceMatchField =
  | "customer_name"
  | "ic_number"
  | "customer_phone"
  | "account_number"
  | "card_number";

export type CollectionSourceMatch = {
  sourceImportId: string;
  sourceImportName: string | null;
  sourceFilename: string | null;
  matchBasis: "ic" | "phone_and_account" | "account_number" | "card_number" | "account_and_card";
  matchAccuracy: number;
  matchedFields: CollectionSourceMatchField[];
  comparedFields: CollectionSourceMatchField[];
  agingBucket?: CollectionAgingBucket;
  cardNumberLast4?: string | null;
  totalDue: CollectionAmountMyrString | null;
  billingPrincipalOsp: CollectionAmountMyrString | null;
  callingDate: string;
  callingWindowEnd: string;
  callingWindowEndExclusive: string;
  currentEntry: CollectionAmountMyrString;
  existingCumulative: CollectionAmountMyrString;
  projectedCumulative: CollectionAmountMyrString;
  remainingAfterSave: CollectionAmountMyrString;
  projectedTotalDueCovered: boolean;
  projectedCpStatus: Exclude<CollectionCpStatus, "unverified">;
};

export type CollectionSourceMatchesResponse = {
  ok: true;
  matches: CollectionSourceMatch[];
};

export type CollectionSavedSourceFile = {
  id: string;
  name: string;
  filename: string;
  createdAt: string;
  rowCount: number;
};

export type CollectionSavedSourceFilesResponse = {
  ok: true;
  sourceFiles: CollectionSavedSourceFile[];
  pagination: {
    limit: number;
    nextCursor: string | null;
    total: number;
  };
};

export type UpdateCollectionPayload = Partial<CreateCollectionPayload> & {
  removeReceipt?: boolean;
  removeReceiptIds?: string[];
  expectedUpdatedAt?: string;
  existingReceiptMetadata?: CollectionReceiptMetadata[] | null;
};

export type CollectionPaginationMeta = {
  mode: "hybrid";
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  limit: number;
  offset: number;
  nextCursor: string | null;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

export type CollectionRecordListResponse = {
  ok: boolean;
  records: CollectionRecord[];
  total: number;
  totalAmount: CollectionAmountMyrNumber;
  page: number;
  pageSize: number;
  limit: number;
  offset: number;
  nextCursor: string | null;
  pagination: CollectionPaginationMeta;
};

export type CollectionNicknameSummaryResponse = {
  ok: boolean;
  nicknames: string[];
  totalRecords: number;
  totalAmount: CollectionAmountMyrNumber;
  page: number;
  pageSize: number;
  limit: number;
  offset: number;
  nicknameTotals: Array<{
    nickname: string;
    totalRecords: number;
    totalAmount: CollectionAmountMyrNumber;
    targetBenchmark?: {
      amount: CollectionAmountMyrNumber;
      configuredMonths: number;
      latestUpdatedAt?: string | null;
      latestUpdatedBy?: string | null;
      missingMonths: number;
      months?: Array<{
        amount: CollectionAmountMyrNumber;
        configured: boolean;
        month: string;
        updatedAt: string | null;
        updatedBy: string | null;
      }>;
      requestedMonths: number;
    } | null;
  }>;
  records: CollectionRecord[];
  freshness?: CollectionReportFreshness;
  pagination: CollectionPaginationMeta;
};

export type CollectionPurgeSummaryResponse = {
  ok: boolean;
  retentionMonths: number;
  cutoffDate: string;
  eligibleRecords: number;
  totalAmount: CollectionAmountMyrNumber;
};

export type CollectionPurgeResponse = {
  ok: boolean;
  retentionMonths: number;
  cutoffDate: string;
  deletedRecords: number;
  totalAmount: CollectionAmountMyrNumber;
};

export type CollectionMonthlySummary = {
  month: number;
  monthName: string;
  totalRecords: number;
  totalAmount: CollectionAmountMyrNumber;
};

export type CollectionMonthlyComparisonMonth = {
  month: string;
  label: string;
  totalCollection: CollectionAmountMyrNumber;
  recordCount: number;
  averagePerRecord: CollectionAmountMyrNumber;
};

export type CollectionMonthlyComparisonResponse = {
  ok: boolean;
  nickname: string;
  startMonth: string;
  endMonth: string;
  months: CollectionMonthlyComparisonMonth[];
  comparison: {
    baseMonth: string | null;
    targetMonth: string;
    baseLabel: string | null;
    targetLabel: string;
    baseTotal: CollectionAmountMyrNumber | null;
    targetTotal: CollectionAmountMyrNumber;
    difference: CollectionAmountMyrNumber | null;
    percentageChange: number | null;
    direction: "increase" | "decrease" | "no_change" | "no_previous_data";
    summary: string;
  };
  freshness?: CollectionReportFreshness;
};

export type CollectionReportFreshness = {
  status: "fresh" | "warming" | "stale";
  pendingCount: number;
  runningCount: number;
  retryCount: number;
  oldestPendingAgeMs: number;
  message: string;
};

export type CollectionDailyUser = {
  id: string;
  username: string;
  role: string;
};

export type CollectionDailyOverviewDay = {
  day: number;
  date: string;
  amount: CollectionAmountMyrNumber;
  target: CollectionAmountMyrNumber;
  calendarStatus: CollectionDailyCalendarStatus;
  leaveType: CollectionDailyLeaveType | null;
  note: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  isWorkingDay: boolean;
  isHoliday: boolean;
  holidayName: string | null;
  customerCount: number;
  status: "green" | "yellow" | "red" | "neutral";
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
  createdAt: string;
};

export type CollectionDailyCalendarAuditResponse = {
  ok: boolean;
  username: string;
  year: number;
  month: number;
  day: number;
  audit: CollectionDailyCalendarAuditEntry[];
};

export type CollectionDailyOverviewResponse = {
  ok: boolean;
  username: string;
  usernames: string[];
  role: string;
  month: {
    year: number;
    month: number;
    daysInMonth: number;
  };
  summary: {
    monthlyTarget: CollectionAmountMyrNumber;
    collectedToDate: number;
    collectedAmount: CollectionAmountMyrNumber;
    remainingTarget: CollectionAmountMyrNumber;
    balancedAmount: CollectionAmountMyrNumber;
    workingDays: number;
    elapsedWorkingDays: number;
    remainingWorkingDays: number;
    requiredPerRemainingWorkingDay: CollectionAmountMyrNumber;
    completedDays: number;
    incompleteDays: number;
    noCollectionDays: number;
    neutralDays: number;
    baseDailyTarget: CollectionAmountMyrNumber;
    dailyTarget: CollectionAmountMyrNumber;
    expectedProgressAmount: CollectionAmountMyrNumber;
    progressVarianceAmount: CollectionAmountMyrNumber;
    achievedAmount: CollectionAmountMyrNumber;
    remainingAmount: CollectionAmountMyrNumber;
    metDays: number;
    yellowDays: number;
    redDays: number;
  };
  days: CollectionDailyOverviewDay[];
  carryForwardRule?: string;
  freshness?: CollectionReportFreshness;
};

export type CollectionMonthlyTargetResponse = {
  ok: boolean;
  nickname: string;
  month: {
    key: string;
    year: number;
    month: number;
  };
  monthlyTarget: CollectionAmountMyrNumber;
  configured: boolean;
  source: "configured" | "missing";
};

export type CollectionDailyDayDetailsResponse = {
  ok: boolean;
  username: string;
  usernames: string[];
  date: string;
  status: "green" | "yellow" | "red" | "neutral";
  message: string;
  amount: CollectionAmountMyrNumber;
  dailyTarget: CollectionAmountMyrNumber;
  customers: Array<{
    id: string;
    customerName: string;
    accountNumber: string;
    amount: CollectionAmountMyrNumber;
    collectionStaffNickname: string;
  }>;
  summary: {
    monthlyTarget: CollectionAmountMyrNumber;
    collected: CollectionAmountMyrNumber;
    balanced: CollectionAmountMyrNumber;
    totalForDate: CollectionAmountMyrNumber;
    targetForDate: CollectionAmountMyrNumber;
  };
  pagination: {
    page: number;
    pageSize: number;
    totalRecords: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  records: Array<{
    id: string;
    customerName: string;
    accountNumber: string;
    paymentDate: string;
    amount: CollectionAmountMyrNumber;
    batch: string;
    paymentReference: string;
    username: string;
    collectionStaffNickname: string;
    createdAt: string;
    receiptFile: string | null;
    receipts: Array<{
      id: string;
      storagePath: string;
      originalFileName: string;
      originalMimeType: string;
      fileSize: number;
      createdAt: string;
    }>;
  }>;
  freshness?: CollectionReportFreshness;
};

export type CollectionNicknameAuthCheckResult = {
  ok: boolean;
  nickname: {
    id: string;
    nickname: string;
    mustChangePassword: boolean;
    passwordResetBySuperuser: boolean;
    requiresPasswordSetup: boolean;
    requiresPasswordLogin: boolean;
    requiresForcedPasswordChange: boolean;
  };
};

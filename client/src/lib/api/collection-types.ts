export type CollectionBatch = "P10" | "P25" | "MDD02" | "MDD10" | "MDD18" | "MDD25";

export type CollectionRecordReceipt = {
  id: string;
  collectionRecordId: string;
  storagePath: string;
  originalFileName: string;
  originalMimeType: string;
  originalExtension: string;
  fileSize: number;
  receiptAmount: string | null;
  extractedAmount: string | null;
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
  batch: CollectionBatch;
  paymentDate: string;
  amount: string;
  receiptFile: string | null;
  receipts: CollectionRecordReceipt[];
  archivedReceipts?: CollectionRecordReceipt[];
  receiptTotalAmount: string;
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
  receiptId?: string;
  receiptAmount?: number | string | null;
  extractedAmount?: number | string | null;
  extractionStatus?: CollectionReceiptExtractionStatus | null;
  extractionConfidence?: number | string | null;
  receiptDate?: string | null;
  receiptReference?: string | null;
  fileHash?: string | null;
};

export type CreateCollectionPayload = {
  customerName: string;
  icNumber: string;
  customerPhone: string;
  accountNumber: string;
  batch: CollectionBatch;
  paymentDate: string;
  amount: number;
  collectionStaffNickname: string;
  receipt?: CollectionReceiptPayload | null;
  receipts?: CollectionReceiptPayload[] | null;
  newReceiptMetadata?: CollectionReceiptMetadata[] | null;
};

export type UpdateCollectionPayload = Partial<CreateCollectionPayload> & {
  removeReceipt?: boolean;
  removeReceiptIds?: string[];
  expectedUpdatedAt?: string;
  existingReceiptMetadata?: CollectionReceiptMetadata[] | null;
};

export type CollectionRecordListResponse = {
  ok: boolean;
  records: CollectionRecord[];
  total: number;
  totalAmount: number;
  limit: number;
  offset: number;
};

export type CollectionPurgeSummaryResponse = {
  ok: boolean;
  retentionMonths: number;
  cutoffDate: string;
  eligibleRecords: number;
  totalAmount: number;
};

export type CollectionPurgeResponse = {
  ok: boolean;
  retentionMonths: number;
  cutoffDate: string;
  deletedRecords: number;
  totalAmount: number;
};

export type CollectionMonthlySummary = {
  month: number;
  monthName: string;
  totalRecords: number;
  totalAmount: number;
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
  amount: number;
  target: number;
  isWorkingDay: boolean;
  isHoliday: boolean;
  holidayName: string | null;
  customerCount: number;
  status: "green" | "yellow" | "red" | "neutral";
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
    monthlyTarget: number;
    collectedToDate: number;
    collectedAmount: number;
    remainingTarget: number;
    balancedAmount: number;
    workingDays: number;
    elapsedWorkingDays: number;
    remainingWorkingDays: number;
    requiredPerRemainingWorkingDay: number;
    completedDays: number;
    incompleteDays: number;
    noCollectionDays: number;
    neutralDays: number;
    baseDailyTarget: number;
    dailyTarget: number;
    expectedProgressAmount: number;
    progressVarianceAmount: number;
    achievedAmount: number;
    remainingAmount: number;
    metDays: number;
    yellowDays: number;
    redDays: number;
  };
  days: CollectionDailyOverviewDay[];
  carryForwardRule?: string;
  freshness?: CollectionReportFreshness;
};

export type CollectionDailyDayDetailsResponse = {
  ok: boolean;
  username: string;
  usernames: string[];
  date: string;
  status: "green" | "yellow" | "red" | "neutral";
  message: string;
  amount: number;
  dailyTarget: number;
  customers: Array<{
    id: string;
    customerName: string;
    accountNumber: string;
    amount: number;
    collectionStaffNickname: string;
  }>;
  summary: {
    monthlyTarget: number;
    collected: number;
    balanced: number;
    totalForDate: number;
    targetForDate: number;
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
    amount: number;
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

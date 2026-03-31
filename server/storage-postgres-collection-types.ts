export type CollectionBatch = "P10" | "P25" | "MDD02" | "MDD10" | "MDD18" | "MDD25";

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
  receiptAmount: string | null;
  extractedAmount: string | null;
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
  createdAt: Date;
  updatedAt?: Date;
};

export type CollectionRecordAggregate = {
  totalRecords: number;
  totalAmount: number;
};

export type CollectionRecordListFilters = {
  from?: string;
  to?: string;
  search?: string;
  createdByLogin?: string;
  nicknames?: string[];
  receiptValidationStatus?: CollectionReceiptValidationStatus | "flagged";
  duplicateOnly?: boolean;
  limit?: number;
  offset?: number;
};

export type CollectionRecordAggregateFilters = Omit<
  CollectionRecordListFilters,
  "limit" | "offset"
>;

export type CollectionNicknameAggregate = {
  nickname: string;
  totalRecords: number;
  totalAmount: number;
};

export type CollectionNicknameDailyAggregate = {
  nickname: string;
  paymentDate: string;
  totalRecords: number;
  totalAmount: number;
};

export type CollectionMonthlySummary = {
  month: number;
  monthName: string;
  totalRecords: number;
  totalAmount: number;
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
  monthlyTarget: number;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CollectionDailyCalendarDay = {
  id: string;
  year: number;
  month: number;
  day: number;
  isWorkingDay: boolean;
  isHoliday: boolean;
  holidayName: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CollectionDailyPaidCustomer = {
  id: string;
  customerName: string;
  accountNumber: string;
  amount: number;
  collectionStaffNickname: string;
};

export type CreateCollectionRecordInput = {
  customerName: string;
  icNumber: string;
  customerPhone: string;
  accountNumber: string;
  batch: CollectionBatch;
  paymentDate: string;
  amount: number;
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
  receiptAmountCents?: number | null;
  extractedAmountCents?: number | null;
  extractionStatus?: CollectionReceiptExtractionStatus | null;
  extractionConfidence?: number | null;
  receiptDate?: string | null;
  receiptReference?: string | null;
  fileHash?: string | null;
};

export type UpdateCollectionRecordReceiptInput = {
  receiptId: string;
  receiptAmountCents?: number | null;
  extractedAmountCents?: number | null;
  extractionStatus?: CollectionReceiptExtractionStatus | null;
  extractionConfidence?: number | null;
  receiptDate?: string | null;
  receiptReference?: string | null;
};

export type UpdateCollectionRecordInput = {
  customerName?: string;
  icNumber?: string;
  customerPhone?: string;
  accountNumber?: string;
  batch?: CollectionBatch;
  paymentDate?: string;
  amount?: number;
  receiptFile?: string | null;
  collectionStaffNickname?: string;
};

export type UpdateCollectionRecordOptions = {
  expectedUpdatedAt?: Date;
  removeAllReceipts?: boolean;
  removeReceiptIds?: string[];
  newReceipts?: CreateCollectionRecordReceiptInput[];
  receiptUpdates?: UpdateCollectionRecordReceiptInput[];
};

export type DeleteCollectionRecordOptions = {
  expectedUpdatedAt?: Date;
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

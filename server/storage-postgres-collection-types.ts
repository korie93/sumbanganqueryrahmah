import type {
  CollectionAmountCents,
  CollectionAmountMyrNumber,
  CollectionAmountMyrString,
} from "../shared/collection-amount-types";

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
  limit?: number | undefined;
  offset?: number | undefined;
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
  amount: CollectionAmountMyrNumber;
  collectionStaffNickname: string;
};

export type CreateCollectionRecordInput = {
  customerName: string;
  icNumber: string;
  customerPhone: string;
  accountNumber: string;
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

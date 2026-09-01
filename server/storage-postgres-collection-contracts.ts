import type {
  CollectionAdminGroup,
  CollectionAdminUser,
  CollectionDailyCalendarAuditEntry,
  CollectionDailyCalendarDay,
  CollectionDailyPaidCustomer,
  CollectionDailyTarget,
  CollectionDailyUser,
  CollectionMonthlyComparisonAggregate,
  CollectionMonthlySummary,
  CollectionNicknameAggregate,
  CollectionNicknameAuthProfile,
  CollectionNicknameDailyAggregate,
  CollectionNicknameSession,
  CollectionRecord,
  CollectionRecordAggregate,
  CollectionRecordAggregateFilters,
  CollectionRecordListFilters,
  CollectionRecordReceipt,
  CollectionReceiptDuplicateSummary,
  CollectionRollupFreshnessSnapshot,
  CollectionStaffNickname,
  CollectionSourceConfig,
  CollectionLegacyBackfillStats,
  ConfigureCollectionSourceInput,
  CollectionSourceMatchResult,
  CollectionBillingPrincipalReport,
  CollectionOspTargetInput,
  CreateCollectionRecordInput,
  CreateCollectionRecordReceiptInput,
  CreateCollectionStaffNicknameInput,
  DeleteCollectionRecordOptions,
  UpdateCollectionRecordInput,
  UpdateCollectionRecordOptions,
  UpdateCollectionRecordReceiptInput,
  UpdateCollectionStaffNicknameInput,
} from "./storage-postgres-collection-types";
import type { CollectionAmountMyrNumber } from "../shared/collection-amount-types";
import type {
  CollectionDailyCalendarStatus,
  CollectionDailyLeaveType,
} from "../shared/collection-daily-status";

export interface CollectionStorageContract {
  backfillLegacyCollectionRecordsForSource(sourceImportId: string): Promise<CollectionLegacyBackfillStats>;
  configureCollectionSource(input: ConfigureCollectionSourceInput): Promise<CollectionSourceConfig>;
  deleteCollectionSource(sourceImportId: string): Promise<boolean>;
  getCollectionSourceConfig(sourceImportId: string): Promise<CollectionSourceConfig | undefined>;
  listCollectionSourceConfigs(): Promise<CollectionSourceConfig[]>;
  findEligibleCollectionSourceMatches(input: {
    paymentDate: string;
    accountNumber?: string;
    cardNumber?: string;
  }): Promise<CollectionSourceMatchResult>;
  getCollectionBillingPrincipalReport(input: {
    sourceImportIds: string[];
    from: string;
    to: string;
    agingBuckets?: Array<"D3" | "D4" | "D5" | "D6"> | undefined;
    nicknames?: string[] | undefined;
    createdByLogin?: string | undefined;
  }): Promise<CollectionBillingPrincipalReport>;
  upsertCollectionOspTargets(input: {
    sourceImportIds: string[];
    from: string;
    to: string;
    targets: CollectionOspTargetInput[];
    configuredBy: string;
  }): Promise<CollectionOspTargetInput[]>;
  createCollectionRecord(
    data: CreateCollectionRecordInput,
    receipts?: CreateCollectionRecordReceiptInput[],
  ): Promise<CollectionRecord>;
  listCollectionRecords(filters?: CollectionRecordListFilters): Promise<CollectionRecord[]>;
  summarizeCollectionRecords(filters?: CollectionRecordAggregateFilters): Promise<CollectionRecordAggregate>;
  summarizeCollectionRecordsByNickname(filters?: CollectionRecordAggregateFilters): Promise<CollectionNicknameAggregate[]>;
  getCollectionRecordDailyRollupFreshness(filters?: {
    from?: string;
    to?: string;
    createdByLogin?: string;
    nicknames?: string[];
  }): Promise<CollectionRollupFreshnessSnapshot>;
  summarizeCollectionRecordsByNicknameAndPaymentDate(
    filters?: CollectionRecordAggregateFilters,
  ): Promise<CollectionNicknameDailyAggregate[]>;
  summarizeCollectionRecordsOlderThan(beforeDate: string): Promise<CollectionRecordAggregate>;
  purgeCollectionRecordsOlderThan(beforeDate: string, purgedBy: string): Promise<{
    totalRecords: number;
    totalAmount: CollectionAmountMyrNumber;
    receiptPaths: string[];
  }>;
  getCollectionMonthlySummary(filters: {
    year: number;
    nicknames?: string[];
    createdByLogin?: string;
  }): Promise<CollectionMonthlySummary[]>;
  getCollectionMonthlyComparison(filters: {
    from: string;
    to: string;
    nicknames?: string[];
    createdByLogin?: string;
  }): Promise<CollectionMonthlyComparisonAggregate[]>;
  getCollectionStaffNicknames(filters?: {
    activeOnly?: boolean;
    allowedRole?: "admin" | "user";
  }): Promise<CollectionStaffNickname[]>;
  getCollectionAdminUsers(): Promise<CollectionAdminUser[]>;
  getCollectionAdminUserById(adminUserId: string): Promise<CollectionAdminUser | undefined>;
  getCollectionAdminAssignedNicknameIds(adminUserId: string): Promise<string[]>;
  getCollectionAdminVisibleNicknames(
    adminUserId: string,
    filters?: { activeOnly?: boolean; allowedRole?: "admin" | "user" },
  ): Promise<CollectionStaffNickname[]>;
  setCollectionAdminAssignedNicknameIds(params: {
    adminUserId: string;
    nicknameIds: string[];
    createdBySuperuser: string;
  }): Promise<string[]>;
  getCollectionAdminGroups(): Promise<CollectionAdminGroup[]>;
  getCollectionAdminGroupById(groupId: string): Promise<CollectionAdminGroup | undefined>;
  createCollectionAdminGroup(params: {
    leaderNicknameId: string;
    memberNicknameIds: string[];
    createdBy: string;
  }): Promise<CollectionAdminGroup>;
  updateCollectionAdminGroup(params: {
    groupId: string;
    leaderNicknameId?: string;
    memberNicknameIds?: string[];
    updatedBy: string;
  }): Promise<CollectionAdminGroup | undefined>;
  deleteCollectionAdminGroup(groupId: string): Promise<boolean>;
  getCollectionAdminGroupVisibleNicknameValuesByLeader(leaderNickname: string): Promise<string[]>;
  setCollectionNicknameSession(params: {
    activityId: string;
    username: string;
    userRole: string;
    nickname: string;
  }): Promise<void>;
  getCollectionNicknameSessionByActivity(activityId: string): Promise<CollectionNicknameSession | undefined>;
  clearCollectionNicknameSessionByActivity(activityId: string): Promise<void>;
  listCollectionDailyUsers(): Promise<CollectionDailyUser[]>;
  getCollectionDailyTarget(params: { username: string; year: number; month: number }): Promise<CollectionDailyTarget | undefined>;
  upsertCollectionDailyTarget(params: {
    username: string;
    year: number;
    month: number;
    monthlyTarget: CollectionAmountMyrNumber;
    actor: string;
  }): Promise<CollectionDailyTarget>;
  listCollectionDailyCalendar(params: {
    username: string;
    year: number;
    month: number;
  }): Promise<CollectionDailyCalendarDay[]>;
  listCollectionDailyCalendarAudit(params: {
    username: string;
    year: number;
    month: number;
    day: number;
    limit?: number | undefined;
  }): Promise<CollectionDailyCalendarAuditEntry[]>;
  upsertCollectionDailyCalendarDays(params: {
    username: string;
    year: number;
    month: number;
    actor: string;
    days: Array<{
      day: number;
      status?: CollectionDailyCalendarStatus | undefined;
      leaveType?: CollectionDailyLeaveType | null | undefined;
      note?: string | null | undefined;
      isWorkingDay: boolean;
      isHoliday: boolean;
      holidayName?: string | null;
    }>;
  }): Promise<CollectionDailyCalendarDay[]>;
  deleteCollectionDailyCalendarDay(params: {
    username: string;
    year: number;
    month: number;
    day: number;
    actor?: string | undefined;
  }): Promise<boolean>;
  listCollectionDailyPaidCustomers(params: {
    username: string;
    date: string;
  }): Promise<CollectionDailyPaidCustomer[]>;
  getCollectionStaffNicknameById(id: string): Promise<CollectionStaffNickname | undefined>;
  getCollectionStaffNicknameByName(nickname: string): Promise<CollectionStaffNickname | undefined>;
  getCollectionNicknameAuthProfileByName(nickname: string): Promise<CollectionNicknameAuthProfile | undefined>;
  setCollectionNicknamePassword(params: {
    nicknameId: string;
    passwordHash: string;
    mustChangePassword?: boolean;
    passwordResetBySuperuser?: boolean;
    passwordUpdatedAt?: Date | null;
  }): Promise<void>;
  createCollectionStaffNickname(data: CreateCollectionStaffNicknameInput): Promise<CollectionStaffNickname>;
  updateCollectionStaffNickname(id: string, data: UpdateCollectionStaffNicknameInput): Promise<CollectionStaffNickname | undefined>;
  deleteCollectionStaffNickname(id: string): Promise<{ deleted: boolean; deactivated: boolean }>;
  isCollectionStaffNicknameActive(nickname: string): Promise<boolean>;
  getCollectionRecordById(id: string): Promise<CollectionRecord | undefined>;
  listCollectionRecordReceipts(recordId: string): Promise<CollectionRecordReceipt[]>;
  getCollectionRecordReceiptById(recordId: string, receiptId: string): Promise<CollectionRecordReceipt | undefined>;
  findCollectionReceiptDuplicateSummaries(
    fileHashes: string[],
    options?: { excludeRecordId?: string },
  ): Promise<CollectionReceiptDuplicateSummary[]>;
  createCollectionRecordReceipts(
    recordId: string,
    receipts: CreateCollectionRecordReceiptInput[],
  ): Promise<CollectionRecordReceipt[]>;
  updateCollectionRecordReceipts(
    recordId: string,
    updates: UpdateCollectionRecordReceiptInput[],
  ): Promise<CollectionRecordReceipt[]>;
  deleteCollectionRecordReceipts(recordId: string, receiptIds: string[]): Promise<CollectionRecordReceipt[]>;
  deleteAllCollectionRecordReceipts(recordId: string): Promise<CollectionRecordReceipt[]>;
  syncCollectionRecordReceiptValidation(recordId: string): Promise<CollectionRecord | undefined>;
  updateCollectionRecord(
    id: string,
    data: UpdateCollectionRecordInput,
    options?: UpdateCollectionRecordOptions,
  ): Promise<CollectionRecord | undefined>;
  deleteCollectionRecord(id: string, options?: DeleteCollectionRecordOptions): Promise<boolean>;
}

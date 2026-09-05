import type {
  CollectionAdminGroup,
  CollectionAdminUser,
  CollectionDailyCalendarDay,
  CollectionDailyPaidCustomer,
  CollectionDailyTarget,
  CollectionDailyUser,
  CollectionMonthlyComparisonAggregate,
  CollectionNicknameAuthProfile,
  CollectionNicknameDailyAggregate,
  CollectionNicknameSession,
  CollectionNicknameAggregate,
  CollectionMonthlySummary,
  CollectionRecord,
  CollectionRecordAggregateFilters,
  CollectionRecordAggregate,
  CollectionRecordListFilters,
  CollectionRecordReceipt,
  CollectionRollupFreshnessSnapshot,
  CollectionBillingPrincipalReport,
  CollectionLegacyBackfillStats,
  CollectionOspTargetInput,
  CollectionSourceConfig,
  CollectionSourceMatchResult,
  CollectionStaffNickname,
  ConfigureCollectionSourceInput,
  CreateCollectionRecordInput,
  CreateCollectionRecordReceiptInput,
  CreateCollectionStaffNicknameInput,
  DeleteCollectionRecordOptions,
  UpdateCollectionRecordReceiptInput,
  UpdateCollectionRecordInput,
  UpdateCollectionRecordOptions,
  UpdateCollectionStaffNicknameInput,
} from "../../storage-postgres";
import type { CollectionAmountMyrNumber } from "../../../shared/collection-amount-types";
import { PostgresSettingsStorage } from "./postgres-settings-storage";

export class PostgresCollectionStorage extends PostgresSettingsStorage {
  async backfillLegacyCollectionRecordsForSource(
    sourceImportId: string,
  ): Promise<CollectionLegacyBackfillStats> {
    return this.collectionRepository.backfillLegacyCollectionRecordsForSource(sourceImportId);
  }

  async getCollectionStaffNicknames(filters?: {
    activeOnly?: boolean;
    allowedRole?: "admin" | "user";
  }): Promise<CollectionStaffNickname[]> {
    return this.collectionRepository.getCollectionStaffNicknames(filters);
  }

  async getCollectionAdminUsers(): Promise<CollectionAdminUser[]> {
    return this.collectionRepository.getCollectionAdminUsers();
  }

  async getCollectionAdminUserById(adminUserId: string): Promise<CollectionAdminUser | undefined> {
    return this.collectionRepository.getCollectionAdminUserById(adminUserId);
  }

  async getCollectionAdminAssignedNicknameIds(adminUserId: string): Promise<string[]> {
    return this.collectionRepository.getCollectionAdminAssignedNicknameIds(adminUserId);
  }

  async getCollectionAdminVisibleNicknames(
    adminUserId: string,
    filters?: { activeOnly?: boolean; allowedRole?: "admin" | "user" },
  ): Promise<CollectionStaffNickname[]> {
    return this.collectionRepository.getCollectionAdminVisibleNicknames(adminUserId, filters);
  }

  async setCollectionAdminAssignedNicknameIds(params: {
    adminUserId: string;
    nicknameIds: string[];
    createdBySuperuser: string;
  }): Promise<string[]> {
    return this.collectionRepository.setCollectionAdminAssignedNicknameIds(params);
  }

  async getCollectionAdminGroups(): Promise<CollectionAdminGroup[]> {
    return this.collectionRepository.getCollectionAdminGroups();
  }

  async getCollectionAdminGroupById(groupId: string): Promise<CollectionAdminGroup | undefined> {
    return this.collectionRepository.getCollectionAdminGroupById(groupId);
  }

  async createCollectionAdminGroup(params: {
    leaderNicknameId: string;
    memberNicknameIds: string[];
    createdBy: string;
  }): Promise<CollectionAdminGroup> {
    return this.collectionRepository.createCollectionAdminGroup(params);
  }

  async updateCollectionAdminGroup(params: {
    groupId: string;
    leaderNicknameId?: string | undefined;
    memberNicknameIds?: string[] | undefined;
    updatedBy: string;
  }): Promise<CollectionAdminGroup | undefined> {
    return this.collectionRepository.updateCollectionAdminGroup(params);
  }

  async deleteCollectionAdminGroup(groupId: string): Promise<boolean> {
    return this.collectionRepository.deleteCollectionAdminGroup(groupId);
  }

  async getCollectionAdminGroupVisibleNicknameValuesByLeader(
    leaderNickname: string,
  ): Promise<string[]> {
    return this.collectionRepository.getCollectionAdminGroupVisibleNicknameValuesByLeader(
      leaderNickname,
    );
  }

  async setCollectionNicknameSession(params: {
    activityId: string;
    username: string;
    userRole: string;
    nickname: string;
    verifiedAt?: Date;
  }): Promise<void> {
    return this.collectionRepository.setCollectionNicknameSession(params);
  }

  async getCollectionNicknameSessionByActivity(
    activityId: string,
  ): Promise<CollectionNicknameSession | undefined> {
    return this.collectionRepository.getCollectionNicknameSessionByActivity(activityId);
  }

  async clearCollectionNicknameSessionByActivity(activityId: string): Promise<void> {
    return this.collectionRepository.clearCollectionNicknameSessionByActivity(activityId);
  }

  async listCollectionDailyUsers(): Promise<CollectionDailyUser[]> {
    return this.collectionRepository.listCollectionDailyUsers();
  }

  async getCollectionDailyTarget(params: {
    username: string;
    year: number;
    month: number;
  }): Promise<CollectionDailyTarget | undefined> {
    return this.collectionRepository.getCollectionDailyTarget(params);
  }

  async upsertCollectionDailyTarget(params: {
    username: string;
    year: number;
    month: number;
    monthlyTarget: CollectionAmountMyrNumber;
    actor: string;
  }): Promise<CollectionDailyTarget> {
    return this.collectionRepository.upsertCollectionDailyTarget(params);
  }

  async listCollectionDailyCalendar(params: {
    username: string;
    year: number;
    month: number;
  }): Promise<CollectionDailyCalendarDay[]> {
    return this.collectionRepository.listCollectionDailyCalendar(params);
  }

  async listCollectionDailyCalendarAudit(params: {
    username: string;
    year: number;
    month: number;
    day: number;
    limit?: number | undefined;
  }) {
    return this.collectionRepository.listCollectionDailyCalendarAudit(params);
  }

  async upsertCollectionDailyCalendarDays(params: {
    username: string;
    year: number;
    month: number;
    actor: string;
    days: Array<{
      day: number;
      status?: CollectionDailyCalendarDay["status"] | undefined;
      leaveType?: CollectionDailyCalendarDay["leaveType"] | undefined;
      note?: string | null | undefined;
      isWorkingDay: boolean;
      isHoliday: boolean;
      holidayName?: string | null;
    }>;
  }): Promise<CollectionDailyCalendarDay[]> {
    return this.collectionRepository.upsertCollectionDailyCalendarDays(params);
  }

  async deleteCollectionDailyCalendarDay(params: {
    username: string;
    year: number;
    month: number;
    day: number;
    actor?: string | undefined;
  }): Promise<boolean> {
    return this.collectionRepository.deleteCollectionDailyCalendarDay(params);
  }

  async listCollectionDailyPaidCustomers(params: {
    username: string;
    date: string;
  }): Promise<CollectionDailyPaidCustomer[]> {
    return this.collectionRepository.listCollectionDailyPaidCustomers(params);
  }

  async getCollectionStaffNicknameById(id: string): Promise<CollectionStaffNickname | undefined> {
    return this.collectionRepository.getCollectionStaffNicknameById(id);
  }

  async getCollectionStaffNicknameByName(
    nickname: string,
  ): Promise<CollectionStaffNickname | undefined> {
    return this.collectionRepository.getCollectionStaffNicknameByName(nickname);
  }

  async getCollectionNicknameAuthProfileByName(
    nickname: string,
  ): Promise<CollectionNicknameAuthProfile | undefined> {
    return this.collectionRepository.getCollectionNicknameAuthProfileByName(nickname);
  }

  async setCollectionNicknamePassword(params: {
    nicknameId: string;
    passwordHash: string;
    mustChangePassword?: boolean;
    passwordResetBySuperuser?: boolean;
    passwordUpdatedAt?: Date | null;
  }): Promise<void> {
    return this.collectionRepository.setCollectionNicknamePassword(params);
  }

  async createCollectionStaffNickname(
    data: CreateCollectionStaffNicknameInput,
  ): Promise<CollectionStaffNickname> {
    return this.collectionRepository.createCollectionStaffNickname(data);
  }

  async updateCollectionStaffNickname(
    id: string,
    data: UpdateCollectionStaffNicknameInput,
  ): Promise<CollectionStaffNickname | undefined> {
    return this.collectionRepository.updateCollectionStaffNickname(id, data);
  }

  async deleteCollectionStaffNickname(
    id: string,
  ): Promise<{ deleted: boolean; deactivated: boolean }> {
    return this.collectionRepository.deleteCollectionStaffNickname(id);
  }

  async isCollectionStaffNicknameActive(nickname: string): Promise<boolean> {
    return this.collectionRepository.isCollectionStaffNicknameActive(nickname);
  }

  async configureCollectionSource(
    input: ConfigureCollectionSourceInput,
  ): Promise<CollectionSourceConfig> {
    return this.collectionRepository.configureCollectionSource(input);
  }

  async deleteCollectionSource(sourceImportId: string): Promise<boolean> {
    return this.collectionRepository.deleteCollectionSource(sourceImportId);
  }

  async getCollectionSourceConfig(
    sourceImportId: string,
  ): Promise<CollectionSourceConfig | undefined> {
    return this.collectionRepository.getCollectionSourceConfig(sourceImportId);
  }

  async listCollectionSourceConfigs(): Promise<CollectionSourceConfig[]> {
    return this.collectionRepository.listCollectionSourceConfigs();
  }

  async findEligibleCollectionSourceMatches(input: {
    paymentDate: string;
    accountNumber?: string;
    cardNumber?: string;
  }): Promise<CollectionSourceMatchResult> {
    return this.collectionRepository.findEligibleCollectionSourceMatches(input);
  }

  async getCollectionBillingPrincipalReport(input: {
    sourceImportIds: string[];
    from: string;
    to: string;
    agingBuckets?: Array<"D3" | "D4" | "D5" | "D6"> | undefined;
    nicknames?: string[] | undefined;
    createdByLogin?: string | undefined;
  }): Promise<CollectionBillingPrincipalReport> {
    return this.collectionRepository.getCollectionBillingPrincipalReport(input);
  }

  async upsertCollectionOspTargets(input: {
    sourceImportIds: string[];
    from: string;
    to: string;
    targets: CollectionOspTargetInput[];
    configuredBy: string;
  }): Promise<CollectionOspTargetInput[]> {
    return this.collectionRepository.upsertCollectionOspTargets(input);
  }

  async listCollectionOspSavedTargets(options?: { includeDeleted?: boolean }) {
    return this.collectionRepository.listCollectionOspSavedTargets(options);
  }

  async getCollectionOspSavedTarget(targetId: string, revisionId?: string) {
    return this.collectionRepository.getCollectionOspSavedTarget(targetId, revisionId);
  }

  async createCollectionOspSavedTarget(input: Parameters<typeof this.collectionRepository.createCollectionOspSavedTarget>[0]) {
    return this.collectionRepository.createCollectionOspSavedTarget(input);
  }

  async updateCollectionOspSavedTarget(input: Parameters<typeof this.collectionRepository.updateCollectionOspSavedTarget>[0]) {
    return this.collectionRepository.updateCollectionOspSavedTarget(input);
  }

  async deleteCollectionOspSavedTarget(input: Parameters<typeof this.collectionRepository.deleteCollectionOspSavedTarget>[0]) {
    return this.collectionRepository.deleteCollectionOspSavedTarget(input);
  }

  async getCollectionOspTargetOverview(input: Parameters<typeof this.collectionRepository.getCollectionOspTargetOverview>[0]) {
    return this.collectionRepository.getCollectionOspTargetOverview(input);
  }

  async upsertCollectionOspClientResults(input: Parameters<typeof this.collectionRepository.upsertCollectionOspClientResults>[0]) {
    return this.collectionRepository.upsertCollectionOspClientResults(input);
  }

  async getCollectionOspCalendar(input: Parameters<typeof this.collectionRepository.getCollectionOspCalendar>[0]) {
    return this.collectionRepository.getCollectionOspCalendar(input);
  }

  async getCollectionOspDrilldown(input: Parameters<typeof this.collectionRepository.getCollectionOspDrilldown>[0]) {
    return this.collectionRepository.getCollectionOspDrilldown(input);
  }

  async getCollectionOspExportDataset(input: Parameters<typeof this.collectionRepository.getCollectionOspExportDataset>[0]) {
    return this.collectionRepository.getCollectionOspExportDataset(input);
  }

  async createCollectionRecord(
    data: CreateCollectionRecordInput,
    receipts: CreateCollectionRecordReceiptInput[] = [],
  ): Promise<CollectionRecord> {
    return this.collectionRepository.createCollectionRecord(data, receipts);
  }

  async listCollectionRecords(filters?: CollectionRecordListFilters): Promise<CollectionRecord[]> {
    return this.collectionRepository.listCollectionRecords(filters);
  }

  async summarizeCollectionRecords(filters?: CollectionRecordAggregateFilters): Promise<CollectionRecordAggregate> {
    return this.collectionRepository.summarizeCollectionRecords(filters);
  }

  async summarizeCollectionRecordsByNickname(
    filters?: CollectionRecordAggregateFilters,
  ): Promise<CollectionNicknameAggregate[]> {
    return this.collectionRepository.summarizeCollectionRecordsByNickname(filters);
  }

  async getCollectionRecordDailyRollupFreshness(filters?: {
    from?: string;
    to?: string;
    createdByLogin?: string;
    nicknames?: string[];
  }): Promise<CollectionRollupFreshnessSnapshot> {
    return this.collectionRepository.getCollectionRecordDailyRollupFreshness(filters);
  }

  async summarizeCollectionRecordsByNicknameAndPaymentDate(
    filters?: CollectionRecordAggregateFilters,
  ): Promise<CollectionNicknameDailyAggregate[]> {
    return this.collectionRepository.summarizeCollectionRecordsByNicknameAndPaymentDate(filters);
  }

  async summarizeCollectionRecordsOlderThan(beforeDate: string): Promise<CollectionRecordAggregate> {
    return this.collectionRepository.summarizeCollectionRecordsOlderThan(beforeDate);
  }

  async purgeCollectionRecordsOlderThan(beforeDate: string, purgedBy: string): Promise<{
    totalRecords: number;
    totalAmount: CollectionAmountMyrNumber;
    receiptPaths: string[];
  }> {
    return this.collectionRepository.purgeCollectionRecordsOlderThan(beforeDate, purgedBy);
  }

  async getCollectionMonthlySummary(filters: {
    year: number;
    createdByLogin?: string;
    nicknames?: string[];
  }): Promise<CollectionMonthlySummary[]> {
    return this.collectionRepository.getCollectionMonthlySummary(filters);
  }

  async getCollectionMonthlyComparison(filters: {
    from: string;
    to: string;
    createdByLogin?: string;
    nicknames?: string[];
  }): Promise<CollectionMonthlyComparisonAggregate[]> {
    return this.collectionRepository.getCollectionMonthlyComparison(filters);
  }

  async getCollectionRecordById(id: string): Promise<CollectionRecord | undefined> {
    return this.collectionRepository.getCollectionRecordById(id);
  }

  async upsertCollectionManualSettlement(
    input: Parameters<typeof this.collectionRepository.upsertCollectionManualSettlement>[0],
  ) {
    return this.collectionRepository.upsertCollectionManualSettlement(input);
  }

  async revokeCollectionManualSettlement(
    input: Parameters<typeof this.collectionRepository.revokeCollectionManualSettlement>[0],
  ) {
    return this.collectionRepository.revokeCollectionManualSettlement(input);
  }

  async listCollectionManualSettlementAudit(recordId: string, limit?: number) {
    return this.collectionRepository.listCollectionManualSettlementAudit(recordId, limit);
  }

  async listCollectionRecordReceipts(recordId: string): Promise<CollectionRecordReceipt[]> {
    return this.collectionRepository.listCollectionRecordReceipts(recordId);
  }

  async getCollectionRecordReceiptById(
    recordId: string,
    receiptId: string,
  ): Promise<CollectionRecordReceipt | undefined> {
    return this.collectionRepository.getCollectionRecordReceiptById(recordId, receiptId);
  }

  async findCollectionReceiptDuplicateSummaries(
    fileHashes: string[],
    options?: { excludeRecordId?: string },
  ) {
    return this.collectionRepository.findCollectionReceiptDuplicateSummaries(fileHashes, options);
  }

  async createCollectionRecordReceipts(
    recordId: string,
    receipts: CreateCollectionRecordReceiptInput[],
  ): Promise<CollectionRecordReceipt[]> {
    return this.collectionRepository.createCollectionRecordReceipts(recordId, receipts);
  }

  async updateCollectionRecordReceipts(
    recordId: string,
    updates: UpdateCollectionRecordReceiptInput[],
  ): Promise<CollectionRecordReceipt[]> {
    return this.collectionRepository.updateCollectionRecordReceipts(recordId, updates);
  }

  async deleteCollectionRecordReceipts(
    recordId: string,
    receiptIds: string[],
  ): Promise<CollectionRecordReceipt[]> {
    return this.collectionRepository.deleteCollectionRecordReceipts(recordId, receiptIds);
  }

  async deleteAllCollectionRecordReceipts(recordId: string): Promise<CollectionRecordReceipt[]> {
    return this.collectionRepository.deleteAllCollectionRecordReceipts(recordId);
  }

  async syncCollectionRecordReceiptValidation(recordId: string): Promise<CollectionRecord | undefined> {
    return this.collectionRepository.syncCollectionRecordReceiptValidation(recordId);
  }

  async updateCollectionRecord(
    id: string,
    data: UpdateCollectionRecordInput,
    options?: UpdateCollectionRecordOptions,
  ): Promise<CollectionRecord | undefined> {
    return this.collectionRepository.updateCollectionRecord(id, data, options);
  }

  async deleteCollectionRecord(id: string, options?: DeleteCollectionRecordOptions): Promise<boolean> {
    return this.collectionRepository.deleteCollectionRecord(id, options);
  }
}

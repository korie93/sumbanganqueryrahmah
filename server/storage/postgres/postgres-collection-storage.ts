import type {
  CollectionAdminGroup,
  CollectionAdminUser,
  CollectionDailyCalendarDay,
  CollectionDailyPaidCustomer,
  CollectionDailyTarget,
  CollectionDailyUser,
  CollectionNicknameAuthProfile,
  CollectionNicknameDailyAggregate,
  CollectionNicknameSession,
  CollectionNicknameAggregate,
  CollectionMonthlySummary,
  CollectionRecord,
  CollectionRecordAggregate,
  CollectionRecordReceipt,
  CollectionStaffNickname,
  CreateCollectionRecordInput,
  CreateCollectionRecordReceiptInput,
  CreateCollectionStaffNicknameInput,
  DeleteCollectionRecordOptions,
  UpdateCollectionRecordInput,
  UpdateCollectionRecordOptions,
  UpdateCollectionStaffNicknameInput,
} from "../../storage-postgres";
import { PostgresSettingsStorage } from "./postgres-settings-storage";

export class PostgresCollectionStorage extends PostgresSettingsStorage {
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
    leaderNicknameId?: string;
    memberNicknameIds?: string[];
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
    monthlyTarget: number;
    actor: string;
  }): Promise<CollectionDailyTarget> {
    return this.collectionRepository.upsertCollectionDailyTarget(params);
  }

  async listCollectionDailyCalendar(params: {
    year: number;
    month: number;
  }): Promise<CollectionDailyCalendarDay[]> {
    return this.collectionRepository.listCollectionDailyCalendar(params);
  }

  async upsertCollectionDailyCalendarDays(params: {
    year: number;
    month: number;
    actor: string;
    days: Array<{
      day: number;
      isWorkingDay: boolean;
      isHoliday: boolean;
      holidayName?: string | null;
    }>;
  }): Promise<CollectionDailyCalendarDay[]> {
    return this.collectionRepository.upsertCollectionDailyCalendarDays(params);
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

  async createCollectionRecord(data: CreateCollectionRecordInput): Promise<CollectionRecord> {
    return this.collectionRepository.createCollectionRecord(data);
  }

  async listCollectionRecords(filters?: {
    from?: string;
    to?: string;
    search?: string;
    createdByLogin?: string;
    nicknames?: string[];
    limit?: number;
    offset?: number;
  }): Promise<CollectionRecord[]> {
    return this.collectionRepository.listCollectionRecords(filters);
  }

  async summarizeCollectionRecords(filters?: {
    from?: string;
    to?: string;
    search?: string;
    createdByLogin?: string;
    nicknames?: string[];
  }): Promise<CollectionRecordAggregate> {
    return this.collectionRepository.summarizeCollectionRecords(filters);
  }

  async summarizeCollectionRecordsByNickname(filters?: {
    from?: string;
    to?: string;
    search?: string;
    createdByLogin?: string;
    nicknames?: string[];
  }): Promise<CollectionNicknameAggregate[]> {
    return this.collectionRepository.summarizeCollectionRecordsByNickname(filters);
  }

  async summarizeCollectionRecordsByNicknameAndPaymentDate(filters?: {
    from?: string;
    to?: string;
    search?: string;
    createdByLogin?: string;
    nicknames?: string[];
  }): Promise<CollectionNicknameDailyAggregate[]> {
    return this.collectionRepository.summarizeCollectionRecordsByNicknameAndPaymentDate(filters);
  }

  async summarizeCollectionRecordsOlderThan(beforeDate: string): Promise<CollectionRecordAggregate> {
    return this.collectionRepository.summarizeCollectionRecordsOlderThan(beforeDate);
  }

  async purgeCollectionRecordsOlderThan(beforeDate: string): Promise<{
    totalRecords: number;
    totalAmount: number;
    receiptPaths: string[];
  }> {
    return this.collectionRepository.purgeCollectionRecordsOlderThan(beforeDate);
  }

  async getCollectionMonthlySummary(filters: {
    year: number;
    createdByLogin?: string;
    nicknames?: string[];
  }): Promise<CollectionMonthlySummary[]> {
    return this.collectionRepository.getCollectionMonthlySummary(filters);
  }

  async getCollectionRecordById(id: string): Promise<CollectionRecord | undefined> {
    return this.collectionRepository.getCollectionRecordById(id);
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

  async createCollectionRecordReceipts(
    recordId: string,
    receipts: CreateCollectionRecordReceiptInput[],
  ): Promise<CollectionRecordReceipt[]> {
    return this.collectionRepository.createCollectionRecordReceipts(recordId, receipts);
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

import { db } from "../db-postgres";
import { sql } from "drizzle-orm";
import {
  mapCollectionAdminUserRow,
} from "./collection-nickname-utils";
import {
  listCollectionAdminAssignedNicknameIds,
  listCollectionAdminVisibleNicknames,
  replaceCollectionAdminAssignedNicknameIds,
} from "./collection-admin-assignment-utils";
import {
  createCollectionAdminGroupInTransaction,
  deleteCollectionAdminGroupInTransaction,
  findCollectionAdminGroupById,
  getCollectionAdminGroupVisibleNicknameValuesByLeader as getCollectionAdminGroupVisibleNicknameValuesByLeaderFromExecutor,
  listCollectionAdminGroups,
  updateCollectionAdminGroupInTransaction,
} from "./collection-admin-group-utils";
import {
  createCollectionRecord,
  deleteCollectionRecord,
  getCollectionMonthlySummary,
  getCollectionRecordById,
  getCollectionRecordDailyRollupFreshnessSnapshot,
  listCollectionRecords,
  purgeCollectionRecordsOlderThan,
  summarizeCollectionRecords,
  summarizeCollectionRecordsByNicknameAndPaymentDate,
  summarizeCollectionRecordsByNickname,
  summarizeCollectionRecordsOlderThan,
  updateCollectionRecord,
} from "./collection-record-repository-utils";
import {
  getCollectionDailyTarget,
  listCollectionDailyCalendar,
  listCollectionDailyPaidCustomers,
  listCollectionDailyUsers,
  upsertCollectionDailyCalendarDays,
  upsertCollectionDailyTarget,
} from "./collection-daily-repository-utils";
import {
  createCollectionRecordReceiptRows,
  deleteAllCollectionRecordReceiptRows,
  deleteCollectionRecordReceiptRows,
  getCollectionRecordReceiptByIdForRecord,
  listCollectionRecordReceiptsByRecordId,
} from "./collection-receipt-utils";
import {
  clearCollectionNicknameSessionValueByActivity,
  createCollectionStaffNicknameValue,
  getCollectionNicknameAuthProfileByNameValue,
  getCollectionNicknameSessionValueByActivity,
  getCollectionStaffNicknameByIdValue,
  getCollectionStaffNicknameByNameValue,
  isCollectionStaffNicknameActiveValue,
  listCollectionStaffNicknames,
  setCollectionNicknamePasswordValue,
  setCollectionNicknameSessionValue,
  updateCollectionStaffNicknameValue,
  deleteCollectionStaffNicknameValue,
} from "./collection-staff-nickname-utils";
import type {
  CollectionAdminGroup,
  CollectionAdminUser,
  CollectionDailyPaidCustomer,
  CollectionDailyTarget,
  CollectionDailyUser,
  CollectionMonthlySummary,
  CollectionNicknameAuthProfile,
  CollectionNicknameSession,
  CollectionNicknameDailyAggregate,
  CollectionRecord,
  CollectionRecordReceipt,
  CollectionStaffNickname,
  CreateCollectionRecordInput,
  CreateCollectionRecordReceiptInput,
  CreateCollectionStaffNicknameInput,
  DeleteCollectionRecordOptions,
  UpdateCollectionRecordInput,
  UpdateCollectionRecordOptions,
  UpdateCollectionStaffNicknameInput,
} from "../storage-postgres";

export class CollectionRepository {
  async getCollectionStaffNicknames(filters?: {
    activeOnly?: boolean;
    allowedRole?: "admin" | "user";
  }): Promise<CollectionStaffNickname[]> {
    return listCollectionStaffNicknames(db, filters);
  }

  async getCollectionAdminUsers(): Promise<CollectionAdminUser[]> {
    const result = await db.execute(sql`
      SELECT
        id,
        username,
        role,
        is_banned,
        created_at,
        updated_at
      FROM public.users
      WHERE role = 'admin'
      ORDER BY lower(username) ASC
      LIMIT 1000
    `);
    return (result.rows || []).map((row: any) => mapCollectionAdminUserRow(row));
  }

  async getCollectionAdminUserById(adminUserId: string): Promise<CollectionAdminUser | undefined> {
    const normalized = String(adminUserId || "").trim();
    if (!normalized) return undefined;

    const result = await db.execute(sql`
      SELECT
        id,
        username,
        role,
        is_banned,
        created_at,
        updated_at
      FROM public.users
      WHERE id = ${normalized}
        AND role = 'admin'
      LIMIT 1
    `);
    const row = result.rows?.[0];
    if (!row) return undefined;
    return mapCollectionAdminUserRow(row);
  }

  async getCollectionAdminAssignedNicknameIds(adminUserId: string): Promise<string[]> {
    return listCollectionAdminAssignedNicknameIds(db, adminUserId);
  }

  async getCollectionAdminVisibleNicknames(
    adminUserId: string,
    filters?: { activeOnly?: boolean; allowedRole?: "admin" | "user" },
  ): Promise<CollectionStaffNickname[]> {
    return listCollectionAdminVisibleNicknames(db, adminUserId, filters);
  }

  async setCollectionAdminAssignedNicknameIds(params: {
    adminUserId: string;
    nicknameIds: string[];
    createdBySuperuser: string;
  }): Promise<string[]> {
    return db.transaction(async (tx) => {
      return replaceCollectionAdminAssignedNicknameIds(tx, params);
    });
  }

  async getCollectionAdminGroups(): Promise<CollectionAdminGroup[]> {
    return listCollectionAdminGroups(db);
  }

  async getCollectionAdminGroupById(groupId: string): Promise<CollectionAdminGroup | undefined> {
    return findCollectionAdminGroupById(db, groupId);
  }

  async createCollectionAdminGroup(params: {
    leaderNicknameId: string;
    memberNicknameIds: string[];
    createdBy: string;
  }): Promise<CollectionAdminGroup> {
    const createdGroupId = await db.transaction(async (tx) => {
      return createCollectionAdminGroupInTransaction(tx, params);
    });
    const created = await this.getCollectionAdminGroupById(createdGroupId);
    if (!created) {
      throw new Error("Failed to create admin group.");
    }
    return created;
  }

  async updateCollectionAdminGroup(params: {
    groupId: string;
    leaderNicknameId?: string;
    memberNicknameIds?: string[];
    updatedBy: string;
  }): Promise<CollectionAdminGroup | undefined> {
    const updatedGroupId = await db.transaction(async (tx) => {
      return updateCollectionAdminGroupInTransaction(tx, params);
    });
    if (!updatedGroupId) return undefined;
    return this.getCollectionAdminGroupById(updatedGroupId);
  }

  async deleteCollectionAdminGroup(groupId: string): Promise<boolean> {
    return db.transaction(async (tx) => {
      return deleteCollectionAdminGroupInTransaction(tx, groupId);
    });
  }

  async getCollectionAdminGroupVisibleNicknameValuesByLeader(leaderNickname: string): Promise<string[]> {
    return getCollectionAdminGroupVisibleNicknameValuesByLeaderFromExecutor(db, leaderNickname);
  }

  async setCollectionNicknameSession(params: {
    activityId: string;
    username: string;
    userRole: string;
    nickname: string;
  }): Promise<void> {
    return setCollectionNicknameSessionValue(db, params);
  }

  async getCollectionNicknameSessionByActivity(activityId: string): Promise<CollectionNicknameSession | undefined> {
    return getCollectionNicknameSessionValueByActivity(db, activityId);
  }

  async clearCollectionNicknameSessionByActivity(activityId: string): Promise<void> {
    return clearCollectionNicknameSessionValueByActivity(db, activityId);
  }

  async listCollectionDailyUsers(): Promise<CollectionDailyUser[]> {
    return listCollectionDailyUsers();
  }

  async getCollectionDailyTarget(params: {
    username: string;
    year: number;
    month: number;
  }): Promise<CollectionDailyTarget | undefined> {
    return getCollectionDailyTarget(params);
  }

  async upsertCollectionDailyTarget(params: {
    username: string;
    year: number;
    month: number;
    monthlyTarget: number;
    actor: string;
  }): Promise<CollectionDailyTarget> {
    return upsertCollectionDailyTarget(params);
  }

  async listCollectionDailyCalendar(params: {
    year: number;
    month: number;
  }) {
    return listCollectionDailyCalendar(params);
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
  }) {
    return upsertCollectionDailyCalendarDays(params);
  }

  async listCollectionDailyPaidCustomers(params: {
    username: string;
    date: string;
  }): Promise<CollectionDailyPaidCustomer[]> {
    return listCollectionDailyPaidCustomers(params);
  }

  async getCollectionStaffNicknameById(id: string): Promise<CollectionStaffNickname | undefined> {
    return getCollectionStaffNicknameByIdValue(db, id);
  }

  async getCollectionStaffNicknameByName(nickname: string): Promise<CollectionStaffNickname | undefined> {
    return getCollectionStaffNicknameByNameValue(db, nickname);
  }

  async getCollectionNicknameAuthProfileByName(nickname: string): Promise<CollectionNicknameAuthProfile | undefined> {
    return getCollectionNicknameAuthProfileByNameValue(db, nickname);
  }

  async setCollectionNicknamePassword(params: {
    nicknameId: string;
    passwordHash: string;
    mustChangePassword?: boolean;
    passwordResetBySuperuser?: boolean;
    passwordUpdatedAt?: Date | null;
  }): Promise<void> {
    return setCollectionNicknamePasswordValue(db, params);
  }

  async createCollectionStaffNickname(data: CreateCollectionStaffNicknameInput): Promise<CollectionStaffNickname> {
    return createCollectionStaffNicknameValue(db, data);
  }

  async updateCollectionStaffNickname(
    id: string,
    data: UpdateCollectionStaffNicknameInput,
  ): Promise<CollectionStaffNickname | undefined> {
    return db.transaction(async (tx) => {
      return updateCollectionStaffNicknameValue(tx, id, data);
    });
  }

  async deleteCollectionStaffNickname(id: string): Promise<{ deleted: boolean; deactivated: boolean }> {
    return deleteCollectionStaffNicknameValue(db, id);
  }

  async isCollectionStaffNicknameActive(nickname: string): Promise<boolean> {
    return isCollectionStaffNicknameActiveValue(db, nickname);
  }

  async createCollectionRecord(data: CreateCollectionRecordInput): Promise<CollectionRecord> {
    return createCollectionRecord(data);
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
    return listCollectionRecords(filters);
  }

  async summarizeCollectionRecords(filters?: {
    from?: string;
    to?: string;
    search?: string;
    createdByLogin?: string;
    nicknames?: string[];
  }): Promise<{ totalRecords: number; totalAmount: number }> {
    return summarizeCollectionRecords(filters);
  }

  async summarizeCollectionRecordsByNickname(filters?: {
    from?: string;
    to?: string;
    search?: string;
    createdByLogin?: string;
    nicknames?: string[];
  }): Promise<Array<{ nickname: string; totalRecords: number; totalAmount: number }>> {
    return summarizeCollectionRecordsByNickname(filters);
  }

  async getCollectionRecordDailyRollupFreshness(filters?: {
    from?: string;
    to?: string;
    createdByLogin?: string;
    nicknames?: string[];
  }) {
    return getCollectionRecordDailyRollupFreshnessSnapshot(filters);
  }

  async summarizeCollectionRecordsByNicknameAndPaymentDate(filters?: {
    from?: string;
    to?: string;
    search?: string;
    createdByLogin?: string;
    nicknames?: string[];
  }): Promise<CollectionNicknameDailyAggregate[]> {
    return summarizeCollectionRecordsByNicknameAndPaymentDate(filters);
  }

  async summarizeCollectionRecordsOlderThan(beforeDate: string): Promise<{ totalRecords: number; totalAmount: number }> {
    return summarizeCollectionRecordsOlderThan(beforeDate);
  }

  async purgeCollectionRecordsOlderThan(beforeDate: string): Promise<{
    totalRecords: number;
    totalAmount: number;
    receiptPaths: string[];
  }> {
    return purgeCollectionRecordsOlderThan(beforeDate);
  }

  async getCollectionMonthlySummary(filters: {
    year: number;
    nicknames?: string[];
    createdByLogin?: string;
  }): Promise<CollectionMonthlySummary[]> {
    return getCollectionMonthlySummary(filters);
  }

  async getCollectionRecordById(id: string): Promise<CollectionRecord | undefined> {
    return getCollectionRecordById(id);
  }

  async listCollectionRecordReceipts(recordId: string): Promise<CollectionRecordReceipt[]> {
    return listCollectionRecordReceiptsByRecordId(db, recordId);
  }

  async getCollectionRecordReceiptById(
    recordId: string,
    receiptId: string,
  ): Promise<CollectionRecordReceipt | undefined> {
    return getCollectionRecordReceiptByIdForRecord(db, recordId, receiptId);
  }

  async createCollectionRecordReceipts(
    recordId: string,
    receipts: CreateCollectionRecordReceiptInput[],
  ): Promise<CollectionRecordReceipt[]> {
    return createCollectionRecordReceiptRows(db, recordId, receipts);
  }

  async deleteCollectionRecordReceipts(
    recordId: string,
    receiptIds: string[],
  ): Promise<CollectionRecordReceipt[]> {
    return deleteCollectionRecordReceiptRows(db, recordId, receiptIds);
  }

  async deleteAllCollectionRecordReceipts(recordId: string): Promise<CollectionRecordReceipt[]> {
    return deleteAllCollectionRecordReceiptRows(db, recordId);
  }

  async updateCollectionRecord(
    id: string,
    data: UpdateCollectionRecordInput,
    options?: UpdateCollectionRecordOptions,
  ): Promise<CollectionRecord | undefined> {
    return updateCollectionRecord(id, data, options);
  }

  async deleteCollectionRecord(id: string, options?: DeleteCollectionRecordOptions): Promise<boolean> {
    return deleteCollectionRecord(id, options);
  }
}

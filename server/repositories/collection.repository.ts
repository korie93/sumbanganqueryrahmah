import { randomUUID } from "crypto";
import { db } from "../db-postgres";
import { sql } from "drizzle-orm";
import {
  buildCollectionMonthlySummaryWhereSql,
  buildCollectionRecordWhereSql,
  collectCollectionReceiptPaths,
  extractCollectionRecordIds,
  mapCollectionAggregateRow,
  mapCollectionMonthlySummaryRows,
  sumCollectionRowAmounts,
} from "./collection-record-query-utils";
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
  attachCollectionReceipts,
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
  CollectionDailyCalendarDay,
  CollectionDailyPaidCustomer,
  CollectionDailyTarget,
  CollectionDailyUser,
  CollectionMonthlySummary,
  CollectionNicknameAuthProfile,
  CollectionNicknameSession,
  CollectionRecord,
  CollectionRecordReceipt,
  CollectionStaffNickname,
  CreateCollectionRecordInput,
  CreateCollectionRecordReceiptInput,
  CreateCollectionStaffNicknameInput,
  UpdateCollectionRecordInput,
  UpdateCollectionStaffNicknameInput,
} from "../storage-postgres";

type CollectionBatch = CollectionRecord["batch"];

export class CollectionRepository {
  private mapCollectionRecordRow(row: any): CollectionRecord {
    const paymentDateRaw = row.payment_date ?? row.paymentDate;
    const paymentDate =
      typeof paymentDateRaw === "string"
        ? paymentDateRaw.slice(0, 10)
        : paymentDateRaw instanceof Date
          ? paymentDateRaw.toISOString().slice(0, 10)
          : "";

    const createdAtRaw = row.created_at ?? row.createdAt;
    const createdAt = createdAtRaw instanceof Date
      ? createdAtRaw
      : new Date(createdAtRaw ?? Date.now());

    return {
      id: String(row.id),
      customerName: String(row.customer_name ?? row.customerName ?? ""),
      icNumber: String(row.ic_number ?? row.icNumber ?? ""),
      customerPhone: String(row.customer_phone ?? row.customerPhone ?? ""),
      accountNumber: String(row.account_number ?? row.accountNumber ?? ""),
      batch: String(row.batch ?? "") as CollectionBatch,
      paymentDate,
      amount: String(row.amount ?? "0"),
      receiptFile: row.receipt_file ?? row.receiptFile ?? null,
      receipts: [],
      createdByLogin: String(row.created_by_login ?? row.createdByLogin ?? row.staff_username ?? row.staffUsername ?? ""),
      collectionStaffNickname: String(row.collection_staff_nickname ?? row.collectionStaffNickname ?? row.staff_username ?? row.staffUsername ?? ""),
      createdAt,
    };
  }

  private mapCollectionDailyTargetRow(row: any): CollectionDailyTarget {
    return {
      id: String(row.id),
      username: String(row.username || "").toLowerCase(),
      year: Number(row.year || 0),
      month: Number(row.month || 0),
      monthlyTarget: Number(row.monthly_target ?? row.monthlyTarget ?? 0),
      createdBy: row.created_by ?? row.createdBy ?? null,
      updatedBy: row.updated_by ?? row.updatedBy ?? null,
      createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
      updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
    };
  }

  private mapCollectionDailyCalendarRow(row: any): CollectionDailyCalendarDay {
    return {
      id: String(row.id),
      year: Number(row.year || 0),
      month: Number(row.month || 0),
      day: Number(row.day || 0),
      isWorkingDay: Boolean(row.is_working_day ?? row.isWorkingDay),
      isHoliday: Boolean(row.is_holiday ?? row.isHoliday),
      holidayName: (row.holiday_name ?? row.holidayName ?? null) as string | null,
      createdBy: (row.created_by ?? row.createdBy ?? null) as string | null,
      updatedBy: (row.updated_by ?? row.updatedBy ?? null) as string | null,
      createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
      updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
    };
  }

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
    const result = await db.execute(sql`
      SELECT id, username, role
      FROM public.users
      WHERE role IN ('user', 'admin', 'superuser')
        AND COALESCE(is_banned, false) = false
        AND COALESCE(status, 'active') <> 'disabled'
      ORDER BY lower(username) ASC
      LIMIT 5000
    `);
    return (result.rows || []).map((row: any) => ({
      id: String(row.id),
      username: String(row.username || "").toLowerCase(),
      role: String(row.role || "user"),
    }));
  }

  async getCollectionDailyTarget(params: {
    username: string;
    year: number;
    month: number;
  }): Promise<CollectionDailyTarget | undefined> {
    const result = await db.execute(sql`
      SELECT
        id,
        username,
        year,
        month,
        monthly_target,
        created_by,
        updated_by,
        created_at,
        updated_at
      FROM public.collection_daily_targets
      WHERE lower(username) = lower(${params.username})
        AND year = ${params.year}
        AND month = ${params.month}
      LIMIT 1
    `);
    const row = result.rows?.[0];
    return row ? this.mapCollectionDailyTargetRow(row) : undefined;
  }

  async upsertCollectionDailyTarget(params: {
    username: string;
    year: number;
    month: number;
    monthlyTarget: number;
    actor: string;
  }): Promise<CollectionDailyTarget> {
    const result = await db.execute(sql`
      INSERT INTO public.collection_daily_targets (
        id,
        username,
        year,
        month,
        monthly_target,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES (
        ${randomUUID()}::uuid,
        lower(${params.username}),
        ${params.year},
        ${params.month},
        ${params.monthlyTarget},
        ${params.actor},
        ${params.actor},
        now(),
        now()
      )
      ON CONFLICT ((lower(username)), year, month)
      DO UPDATE SET
        monthly_target = EXCLUDED.monthly_target,
        updated_by = EXCLUDED.updated_by,
        updated_at = now()
      RETURNING
        id,
        username,
        year,
        month,
        monthly_target,
        created_by,
        updated_by,
        created_at,
        updated_at
    `);
    const row = result.rows?.[0];
    if (!row) {
      throw new Error("Failed to upsert collection daily target.");
    }
    return this.mapCollectionDailyTargetRow(row);
  }

  async listCollectionDailyCalendar(params: {
    year: number;
    month: number;
  }): Promise<CollectionDailyCalendarDay[]> {
    const result = await db.execute(sql`
      SELECT
        id,
        year,
        month,
        day,
        is_working_day,
        is_holiday,
        holiday_name,
        created_by,
        updated_by,
        created_at,
        updated_at
      FROM public.collection_daily_calendar
      WHERE year = ${params.year}
        AND month = ${params.month}
      ORDER BY day ASC
    `);
    return (result.rows || []).map((row: any) => this.mapCollectionDailyCalendarRow(row));
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
    if (!params.days.length) {
      return [];
    }

    for (const day of params.days) {
      await db.execute(sql`
        INSERT INTO public.collection_daily_calendar (
          id,
          year,
          month,
          day,
          is_working_day,
          is_holiday,
          holiday_name,
          created_by,
          updated_by,
          created_at,
          updated_at
        )
        VALUES (
          ${randomUUID()}::uuid,
          ${params.year},
          ${params.month},
          ${day.day},
          ${day.isWorkingDay},
          ${day.isHoliday},
          ${day.holidayName ?? null},
          ${params.actor},
          ${params.actor},
          now(),
          now()
        )
        ON CONFLICT (year, month, day)
        DO UPDATE SET
          is_working_day = EXCLUDED.is_working_day,
          is_holiday = EXCLUDED.is_holiday,
          holiday_name = EXCLUDED.holiday_name,
          updated_by = EXCLUDED.updated_by,
          updated_at = now()
      `);
    }

    return this.listCollectionDailyCalendar({
      year: params.year,
      month: params.month,
    });
  }

  async listCollectionDailyPaidCustomers(params: {
    username: string;
    date: string;
  }): Promise<CollectionDailyPaidCustomer[]> {
    const result = await db.execute(sql`
      SELECT
        id,
        customer_name,
        account_number,
        amount,
        collection_staff_nickname
      FROM public.collection_records
      WHERE lower(created_by_login) = lower(${params.username})
        AND payment_date = ${params.date}::date
      ORDER BY created_at ASC, id ASC
    `);
    return (result.rows || []).map((row: any) => ({
      id: String(row.id),
      customerName: String(row.customer_name || ""),
      accountNumber: String(row.account_number || ""),
      amount: Number(row.amount || 0),
      collectionStaffNickname: String(row.collection_staff_nickname || ""),
    }));
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
    const id = randomUUID();
    await db.execute(sql`
      INSERT INTO public.collection_records (
        id,
        customer_name,
        ic_number,
        customer_phone,
        account_number,
        batch,
        payment_date,
        amount,
        receipt_file,
        created_by_login,
        collection_staff_nickname,
        staff_username,
        created_at
      )
      VALUES (
        ${id}::uuid,
        ${data.customerName},
        ${data.icNumber},
        ${data.customerPhone},
        ${data.accountNumber},
        ${data.batch},
        ${data.paymentDate}::date,
        ${data.amount},
        ${null},
        ${data.createdByLogin},
        ${data.collectionStaffNickname},
        ${data.collectionStaffNickname},
        now()
      )
    `);
    const created = await this.getCollectionRecordById(id);
    if (!created) {
      throw new Error("Failed to load created collection record.");
    }
    return created;
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
    const whereSql = buildCollectionRecordWhereSql(filters);
    const parsedLimit = Number(filters?.limit);
    const safeLimit = Number.isFinite(parsedLimit)
      ? Math.min(2000, Math.max(1, Math.floor(parsedLimit)))
      : 500;
    const parsedOffset = Number(filters?.offset);
    const safeOffset = Number.isFinite(parsedOffset)
      ? Math.max(0, Math.floor(parsedOffset))
      : 0;

    const result = await db.execute(sql`
      SELECT
        id,
        customer_name,
        ic_number,
        customer_phone,
        account_number,
        batch,
        payment_date,
        amount,
        receipt_file,
        created_by_login,
        collection_staff_nickname,
        staff_username,
        created_at
      FROM public.collection_records
      ${whereSql}
      ORDER BY payment_date ASC, created_at ASC, id ASC
      LIMIT ${safeLimit}
      OFFSET ${safeOffset}
    `);

    const records = (result.rows || []).map((row: any) => this.mapCollectionRecordRow(row));
    return attachCollectionReceipts(db, records);
  }

  async summarizeCollectionRecords(filters?: {
    from?: string;
    to?: string;
    search?: string;
    createdByLogin?: string;
    nicknames?: string[];
  }): Promise<{ totalRecords: number; totalAmount: number }> {
    const whereSql = buildCollectionRecordWhereSql(filters);

    const result = await db.execute(sql`
      SELECT
        COUNT(*)::int AS total_records,
        COALESCE(SUM(amount), 0)::numeric(14,2) AS total_amount
      FROM public.collection_records
      ${whereSql}
    `);

    return mapCollectionAggregateRow(result.rows?.[0]);
  }

  async summarizeCollectionRecordsByNickname(filters?: {
    from?: string;
    to?: string;
    search?: string;
    createdByLogin?: string;
    nicknames?: string[];
  }): Promise<Array<{ nickname: string; totalRecords: number; totalAmount: number }>> {
    const whereSql = buildCollectionRecordWhereSql(filters);

    const result = await db.execute(sql`
      SELECT
        collection_staff_nickname as nickname,
        COUNT(*)::int AS total_records,
        COALESCE(SUM(amount), 0)::numeric(14,2) AS total_amount
      FROM public.collection_records
      ${whereSql}
      GROUP BY collection_staff_nickname
      ORDER BY lower(collection_staff_nickname) ASC
    `);

    return (result.rows || []).map((row: any) => ({
      nickname: String(row.nickname || "Unknown"),
      totalRecords: Number(row.total_records || 0),
      totalAmount: Number(row.total_amount || 0),
    }));
  }

  async summarizeCollectionRecordsOlderThan(beforeDate: string): Promise<{ totalRecords: number; totalAmount: number }> {
    const normalizedBeforeDate = String(beforeDate || "").trim();
    if (!normalizedBeforeDate) {
      return {
        totalRecords: 0,
        totalAmount: 0,
      };
    }

    const result = await db.execute(sql`
      SELECT
        COUNT(*)::int AS total_records,
        COALESCE(SUM(amount), 0)::numeric(14,2) AS total_amount
      FROM public.collection_records
      WHERE payment_date < ${normalizedBeforeDate}::date
    `);

    return mapCollectionAggregateRow(result.rows?.[0]);
  }

  async purgeCollectionRecordsOlderThan(beforeDate: string): Promise<{
    totalRecords: number;
    totalAmount: number;
    receiptPaths: string[];
  }> {
    const normalizedBeforeDate = String(beforeDate || "").trim();
    if (!normalizedBeforeDate) {
      return {
        totalRecords: 0,
        totalAmount: 0,
        receiptPaths: [],
      };
    }

    return db.transaction(async (tx) => {
      const oldRecordsResult = await tx.execute(sql`
        SELECT
          id,
          amount,
          receipt_file
        FROM public.collection_records
        WHERE payment_date < ${normalizedBeforeDate}::date
        ORDER BY payment_date ASC, created_at ASC, id ASC
      `);

      const oldRecordRows = Array.isArray(oldRecordsResult.rows) ? oldRecordsResult.rows : [];
      if (!oldRecordRows.length) {
        return {
          totalRecords: 0,
          totalAmount: 0,
          receiptPaths: [],
        };
      }

      const recordIds = extractCollectionRecordIds(oldRecordRows);
      if (!recordIds.length) {
        return {
          totalRecords: 0,
          totalAmount: 0,
          receiptPaths: [],
        };
      }

      const recordIdSql = sql.join(recordIds.map((value) => sql`${value}::uuid`), sql`, `);
      const receiptRowsResult = await tx.execute(sql`
        SELECT storage_path
        FROM public.collection_record_receipts
        WHERE collection_record_id IN (${recordIdSql})
      `);

      await tx.execute(sql`
        DELETE FROM public.collection_record_receipts
        WHERE collection_record_id IN (${recordIdSql})
      `);

      await tx.execute(sql`
        DELETE FROM public.collection_records
        WHERE id IN (${recordIdSql})
      `);

      const receiptPaths = collectCollectionReceiptPaths(
        oldRecordRows,
        Array.isArray(receiptRowsResult.rows) ? receiptRowsResult.rows : [],
      );

      return {
        totalRecords: oldRecordRows.length,
        totalAmount: sumCollectionRowAmounts(oldRecordRows),
        receiptPaths,
      };
    });
  }

  async getCollectionMonthlySummary(filters: {
    year: number;
    nicknames?: string[];
    createdByLogin?: string;
  }): Promise<CollectionMonthlySummary[]> {
    const { whereSql } = buildCollectionMonthlySummaryWhereSql(filters);
    const result = await db.execute(sql`
      SELECT
        EXTRACT(MONTH FROM payment_date)::int AS month,
        COUNT(*)::int AS total_records,
        COALESCE(SUM(amount), 0)::numeric(14,2) AS total_amount
      FROM public.collection_records
      ${whereSql}
      GROUP BY 1
      ORDER BY 1
      LIMIT 12
    `);

    return mapCollectionMonthlySummaryRows(result.rows || []);
  }

  async getCollectionRecordById(id: string): Promise<CollectionRecord | undefined> {
    const result = await db.execute(sql`
      SELECT
        id,
        customer_name,
        ic_number,
        customer_phone,
        account_number,
        batch,
        payment_date,
        amount,
        receipt_file,
        created_by_login,
        collection_staff_nickname,
        staff_username,
        created_at
      FROM public.collection_records
      WHERE id = ${id}::uuid
      LIMIT 1
    `);

    const row = result.rows?.[0];
    if (!row) return undefined;
    const [record] = await attachCollectionReceipts(db, [this.mapCollectionRecordRow(row)]);
    return record;
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

  async updateCollectionRecord(id: string, data: UpdateCollectionRecordInput): Promise<CollectionRecord | undefined> {
    const updateChunks: any[] = [];

    if (data.customerName !== undefined) {
      updateChunks.push(sql`customer_name = ${data.customerName}`);
    }
    if (data.icNumber !== undefined) {
      updateChunks.push(sql`ic_number = ${data.icNumber}`);
    }
    if (data.customerPhone !== undefined) {
      updateChunks.push(sql`customer_phone = ${data.customerPhone}`);
    }
    if (data.accountNumber !== undefined) {
      updateChunks.push(sql`account_number = ${data.accountNumber}`);
    }
    if (data.batch !== undefined) {
      updateChunks.push(sql`batch = ${data.batch}`);
    }
    if (data.paymentDate !== undefined) {
      updateChunks.push(sql`payment_date = ${data.paymentDate}::date`);
    }
    if (data.amount !== undefined) {
      updateChunks.push(sql`amount = ${data.amount}`);
    }
    if (Object.prototype.hasOwnProperty.call(data, "receiptFile")) {
      // Transitional-only legacy cache update. Authoritative receipts are stored in collection_record_receipts.
      updateChunks.push(sql`receipt_file = ${data.receiptFile ?? null}`);
    }
    if (data.collectionStaffNickname !== undefined) {
      updateChunks.push(sql`collection_staff_nickname = ${data.collectionStaffNickname}`);
      updateChunks.push(sql`staff_username = ${data.collectionStaffNickname}`);
    }

    if (!updateChunks.length) {
      return this.getCollectionRecordById(id);
    }

    const result = await db.execute(sql`
      UPDATE public.collection_records
      SET ${sql.join(updateChunks, sql`, `)}
      WHERE id = ${id}::uuid
      RETURNING
        id,
        customer_name,
        ic_number,
        customer_phone,
        account_number,
        batch,
        payment_date,
        amount,
        receipt_file,
        created_by_login,
        collection_staff_nickname,
        staff_username,
        created_at
    `);

    const row = result.rows?.[0];
    if (!row) return undefined;
    return this.getCollectionRecordById(id);
  }

  async deleteCollectionRecord(id: string): Promise<boolean> {
    await db.execute(sql`DELETE FROM public.collection_record_receipts WHERE collection_record_id = ${id}::uuid`);
    await db.execute(sql`DELETE FROM public.collection_records WHERE id = ${id}::uuid`);
    return true;
  }
}

import { randomUUID } from "crypto";
import { db } from "../db-postgres";
import { sql } from "drizzle-orm";
import type {
  CollectionAdminGroup,
  CollectionAdminUser,
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

const COLLECTION_MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

type CollectionBatch = CollectionRecord["batch"];

function normalizeCollectionNicknameRoleScope(value: unknown): "admin" | "user" | "both" {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "admin" || normalized === "user" || normalized === "both") {
    return normalized;
  }
  return "both";
}

export class CollectionRepository {
  private mapCollectionStaffNicknameRow(row: any): CollectionStaffNickname {
    const createdAtRaw = row.created_at ?? row.createdAt;
    const createdAt = createdAtRaw instanceof Date
      ? createdAtRaw
      : new Date(createdAtRaw ?? Date.now());

    return {
      id: String(row.id ?? ""),
      nickname: String(row.nickname ?? ""),
      isActive: Boolean(row.is_active ?? row.isActive),
      roleScope: normalizeCollectionNicknameRoleScope(row.role_scope ?? row.roleScope),
      createdBy: row.created_by ?? row.createdBy ?? null,
      createdAt,
    };
  }

  private mapCollectionNicknameAuthProfileRow(row: any): CollectionNicknameAuthProfile {
    const passwordUpdatedAtRaw = row.password_updated_at ?? row.passwordUpdatedAt ?? null;
    const passwordUpdatedAt =
      passwordUpdatedAtRaw instanceof Date
        ? passwordUpdatedAtRaw
        : passwordUpdatedAtRaw
          ? new Date(passwordUpdatedAtRaw)
          : null;

    return {
      id: String(row.id ?? ""),
      nickname: String(row.nickname ?? ""),
      isActive: Boolean(row.is_active ?? row.isActive),
      roleScope: normalizeCollectionNicknameRoleScope(row.role_scope ?? row.roleScope),
      mustChangePassword: Boolean(row.must_change_password ?? row.mustChangePassword ?? true),
      passwordResetBySuperuser: Boolean(row.password_reset_by_superuser ?? row.passwordResetBySuperuser ?? false),
      nicknamePasswordHash: row.nickname_password_hash ?? row.nicknamePasswordHash ?? null,
      passwordUpdatedAt,
    };
  }

  private mapCollectionAdminUserRow(row: any): CollectionAdminUser {
    const createdAtRaw = row.created_at ?? row.createdAt;
    const createdAt = createdAtRaw instanceof Date
      ? createdAtRaw
      : new Date(createdAtRaw ?? Date.now());
    const updatedAtRaw = row.updated_at ?? row.updatedAt;
    const updatedAt = updatedAtRaw instanceof Date
      ? updatedAtRaw
      : new Date(updatedAtRaw ?? Date.now());

    return {
      id: String(row.id ?? ""),
      username: String(row.username ?? ""),
      role: "admin",
      isBanned: row.is_banned ?? row.isBanned ?? null,
      createdAt,
      updatedAt,
    };
  }

  private mapCollectionAdminGroupRow(
    row: any,
    nicknameIdByLowerName: Map<string, string>,
  ): CollectionAdminGroup {
    const createdAtRaw = row.created_at ?? row.createdAt;
    const createdAt = createdAtRaw instanceof Date
      ? createdAtRaw
      : new Date(createdAtRaw ?? Date.now());
    const updatedAtRaw = row.updated_at ?? row.updatedAt;
    const updatedAt = updatedAtRaw instanceof Date
      ? updatedAtRaw
      : new Date(updatedAtRaw ?? Date.now());

    const rawMembers: unknown[] = Array.isArray(row.member_nicknames)
      ? row.member_nicknames
      : Array.isArray(row.memberNicknames)
        ? row.memberNicknames
        : [];

    const memberNicknames = Array.from(new Set(
      rawMembers
        .map((value) => String(value ?? "").trim())
        .filter(Boolean),
    )).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

    const memberNicknameIds = memberNicknames
      .map((name) => nicknameIdByLowerName.get(name.toLowerCase()) || "")
      .filter(Boolean);

    return {
      id: String(row.id ?? ""),
      leaderNickname: String(row.leader_nickname ?? row.leaderNickname ?? ""),
      leaderNicknameId: row.leader_nickname_id || row.leaderNicknameId
        ? String(row.leader_nickname_id ?? row.leaderNicknameId)
        : null,
      leaderIsActive: Boolean(row.leader_is_active ?? row.leaderIsActive ?? false),
      leaderRoleScope: row.leader_role_scope
        ? normalizeCollectionNicknameRoleScope(row.leader_role_scope)
        : row.leaderRoleScope
          ? normalizeCollectionNicknameRoleScope(row.leaderRoleScope)
          : null,
      memberNicknames,
      memberNicknameIds,
      createdBy: row.created_by ?? row.createdBy ?? null,
      createdAt,
      updatedAt,
    };
  }

  private mapCollectionNicknameSessionRow(row: any): CollectionNicknameSession {
    const verifiedAtRaw = row.verified_at ?? row.verifiedAt;
    const updatedAtRaw = row.updated_at ?? row.updatedAt;
    return {
      activityId: String(row.activity_id ?? row.activityId ?? ""),
      username: String(row.username ?? ""),
      userRole: String(row.user_role ?? row.userRole ?? ""),
      nickname: String(row.nickname ?? ""),
      verifiedAt: verifiedAtRaw instanceof Date ? verifiedAtRaw : new Date(verifiedAtRaw ?? Date.now()),
      updatedAt: updatedAtRaw instanceof Date ? updatedAtRaw : new Date(updatedAtRaw ?? Date.now()),
    };
  }

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

  private mapCollectionRecordReceiptRow(row: any): CollectionRecordReceipt {
    const createdAtRaw = row.created_at ?? row.createdAt;
    const createdAt = createdAtRaw instanceof Date
      ? createdAtRaw
      : new Date(createdAtRaw ?? Date.now());

    return {
      id: String(row.id ?? ""),
      collectionRecordId: String(row.collection_record_id ?? row.collectionRecordId ?? ""),
      storagePath: String(row.storage_path ?? row.storagePath ?? ""),
      originalFileName: String(row.original_file_name ?? row.originalFileName ?? ""),
      originalMimeType: String(row.original_mime_type ?? row.originalMimeType ?? "application/octet-stream"),
      originalExtension: String(row.original_extension ?? row.originalExtension ?? ""),
      fileSize: Number(row.file_size ?? row.fileSize ?? 0),
      createdAt,
    };
  }

  private async loadReceiptMapByRecordIds(recordIds: string[]): Promise<Map<string, CollectionRecordReceipt[]>> {
    const normalizedIds = Array.from(
      new Set(
        recordIds
          .map((value) => String(value || "").trim())
          .filter(Boolean),
      ),
    );
    const receiptMap = new Map<string, CollectionRecordReceipt[]>();
    if (!normalizedIds.length) return receiptMap;

    const idSql = sql.join(normalizedIds.map((value) => sql`${value}::uuid`), sql`, `);
    const result = await db.execute(sql`
      SELECT
        id,
        collection_record_id,
        storage_path,
        original_file_name,
        original_mime_type,
        original_extension,
        file_size,
        created_at
      FROM public.collection_record_receipts
      WHERE collection_record_id IN (${idSql})
      ORDER BY created_at ASC, id ASC
    `);

    for (const row of result.rows || []) {
      const receipt = this.mapCollectionRecordReceiptRow(row);
      const current = receiptMap.get(receipt.collectionRecordId) || [];
      current.push(receipt);
      receiptMap.set(receipt.collectionRecordId, current);
    }

    return receiptMap;
  }

  private async attachReceipts(records: CollectionRecord[]): Promise<CollectionRecord[]> {
    if (!records.length) return records;
    const receiptMap = await this.loadReceiptMapByRecordIds(records.map((record) => record.id));

    return records.map((record) => {
      const receipts = receiptMap.get(record.id) || [];
      const firstReceiptPath = receipts[0]?.storagePath || record.receiptFile || null;
      return {
        ...record,
        receiptFile: firstReceiptPath,
        receipts,
      };
    });
  }

  async getCollectionStaffNicknames(filters?: {
    activeOnly?: boolean;
    allowedRole?: "admin" | "user";
  }): Promise<CollectionStaffNickname[]> {
    const conditions: any[] = [];
    if (filters?.activeOnly === true) {
      conditions.push(sql`is_active = true`);
    }
    if (filters?.allowedRole === "admin") {
      conditions.push(sql`role_scope IN ('admin', 'both')`);
    } else if (filters?.allowedRole === "user") {
      conditions.push(sql`role_scope IN ('user', 'both')`);
    }
    const whereSql = conditions.length > 0
      ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
      : sql``;

    const result = await db.execute(sql`
      SELECT
        id,
        nickname,
        is_active,
        role_scope,
        created_by,
        created_at
      FROM public.collection_staff_nicknames
      ${whereSql}
      ORDER BY is_active DESC, lower(nickname) ASC
      LIMIT 1000
    `);

    return (result.rows || []).map((row: any) => this.mapCollectionStaffNicknameRow(row));
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
    return (result.rows || []).map((row: any) => this.mapCollectionAdminUserRow(row));
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
    return this.mapCollectionAdminUserRow(row);
  }

  async getCollectionAdminAssignedNicknameIds(adminUserId: string): Promise<string[]> {
    const normalized = String(adminUserId || "").trim();
    if (!normalized) return [];

    const result = await db.execute(sql`
      SELECT avn.nickname_id
      FROM public.admin_visible_nicknames avn
      WHERE avn.admin_user_id = ${normalized}
      ORDER BY avn.nickname_id ASC
      LIMIT 5000
    `);
    return (result.rows || [])
      .map((row: any) => String(row.nickname_id || "").trim())
      .filter(Boolean);
  }

  async getCollectionAdminVisibleNicknames(
    adminUserId: string,
    filters?: { activeOnly?: boolean; allowedRole?: "admin" | "user" },
  ): Promise<CollectionStaffNickname[]> {
    const normalized = String(adminUserId || "").trim();
    if (!normalized) return [];

    const conditions: any[] = [sql`avn.admin_user_id = ${normalized}`];
    if (filters?.activeOnly === true) {
      conditions.push(sql`n.is_active = true`);
    }
    if (filters?.allowedRole === "admin") {
      conditions.push(sql`n.role_scope IN ('admin', 'both')`);
    } else if (filters?.allowedRole === "user") {
      conditions.push(sql`n.role_scope IN ('user', 'both')`);
    }
    const whereSql = sql`WHERE ${sql.join(conditions, sql` AND `)}`;

    const result = await db.execute(sql`
      SELECT
        n.id,
        n.nickname,
        n.is_active,
        n.role_scope,
        n.created_by,
        n.created_at
      FROM public.admin_visible_nicknames avn
      INNER JOIN public.collection_staff_nicknames n
        ON n.id = avn.nickname_id
      INNER JOIN public.users u
        ON u.id = avn.admin_user_id
       AND u.role = 'admin'
      ${whereSql}
      ORDER BY n.is_active DESC, lower(n.nickname) ASC
      LIMIT 1000
    `);

    return (result.rows || []).map((row: any) => this.mapCollectionStaffNicknameRow(row));
  }

  async setCollectionAdminAssignedNicknameIds(params: {
    adminUserId: string;
    nicknameIds: string[];
    createdBySuperuser: string;
  }): Promise<string[]> {
    const adminUserId = String(params.adminUserId || "").trim();
    const createdBySuperuser = String(params.createdBySuperuser || "").trim();
    if (!adminUserId) {
      throw new Error("adminUserId is required.");
    }
    if (!createdBySuperuser) {
      throw new Error("createdBySuperuser is required.");
    }

    const normalizedNicknameIds = Array.isArray(params.nicknameIds)
      ? params.nicknameIds
        .map((value) => String(value || "").trim())
        .filter((value, index, array) => Boolean(value) && array.indexOf(value) === index)
      : [];

    return db.transaction(async (tx) => {
      const adminCheck = await tx.execute(sql`
        SELECT id
        FROM public.users
        WHERE id = ${adminUserId}
          AND role = 'admin'
        LIMIT 1
      `);
      if (!adminCheck.rows?.[0]) {
        throw new Error("Admin user not found.");
      }

      let validNicknameIds: string[] = [];
      if (normalizedNicknameIds.length > 0) {
        const nicknameSql = sql.join(
          normalizedNicknameIds.map((value) => sql`${value}::uuid`),
          sql`, `,
        );
        const validRows = await tx.execute(sql`
          SELECT id
          FROM public.collection_staff_nicknames
          WHERE id IN (${nicknameSql})
          LIMIT 5000
        `);
        validNicknameIds = (validRows.rows || [])
          .map((row: any) => String(row.id || "").trim())
          .filter(Boolean);
        if (validNicknameIds.length !== normalizedNicknameIds.length) {
          throw new Error("Invalid nickname ids.");
        }
      }

      await tx.execute(sql`
        DELETE FROM public.admin_visible_nicknames
        WHERE admin_user_id = ${adminUserId}
      `);

      for (const nicknameId of validNicknameIds) {
        await tx.execute(sql`
          INSERT INTO public.admin_visible_nicknames (
            id,
            admin_user_id,
            nickname_id,
            created_by_superuser,
            created_at
          )
          VALUES (
            ${randomUUID()}::uuid,
            ${adminUserId},
            ${nicknameId}::uuid,
            ${createdBySuperuser},
            now()
          )
          ON CONFLICT (admin_user_id, nickname_id) DO NOTHING
        `);
      }

      const assignedRows = await tx.execute(sql`
        SELECT nickname_id
        FROM public.admin_visible_nicknames
        WHERE admin_user_id = ${adminUserId}
        ORDER BY nickname_id ASC
      `);
      return (assignedRows.rows || [])
        .map((row: any) => String(row.nickname_id || "").trim())
        .filter(Boolean);
    });
  }

  private async resolveNicknameNamesByIds(
    tx: { execute: (query: any) => Promise<any> },
    nicknameIds: string[],
  ): Promise<Array<{ id: string; nickname: string; roleScope: "admin" | "user" | "both"; isActive: boolean }>> {
    const normalizedIds = Array.isArray(nicknameIds)
      ? nicknameIds
        .map((value) => String(value || "").trim())
        .filter((value, index, array) => Boolean(value) && array.indexOf(value) === index)
      : [];
    if (!normalizedIds.length) return [];

    const idSql = sql.join(normalizedIds.map((value) => sql`${value}::uuid`), sql`, `);
    const result = await tx.execute(sql`
      SELECT id, nickname, role_scope, is_active
      FROM public.collection_staff_nicknames
      WHERE id IN (${idSql})
      LIMIT 5000
    `);
    const rows = (result.rows || []).map((row: any) => ({
      id: String(row.id || "").trim(),
      nickname: String(row.nickname || "").trim(),
      roleScope: normalizeCollectionNicknameRoleScope(row.role_scope),
      isActive: Boolean(row.is_active),
    }));
    if (rows.length !== normalizedIds.length) {
      throw new Error("Invalid nickname ids.");
    }
    return rows;
  }

  private async validateAdminGroupComposition(params: {
    tx: { execute: (query: any) => Promise<any> };
    groupIdToExclude?: string;
    leaderNickname: string;
    memberNicknames: string[];
  }): Promise<void> {
    const leaderLower = params.leaderNickname.toLowerCase();
    const uniqueMembers = Array.from(new Set(
      params.memberNicknames
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ));
    const memberLower = uniqueMembers.map((value) => value.toLowerCase());

    if (memberLower.includes(leaderLower)) {
      throw new Error("Leader nickname cannot be a member of the same group.");
    }

    const leaderRows = await params.tx.execute(sql`
      SELECT id
      FROM public.admin_groups
      WHERE lower(leader_nickname) = lower(${params.leaderNickname})
        ${params.groupIdToExclude ? sql`AND id <> ${params.groupIdToExclude}::uuid` : sql``}
      LIMIT 1
    `);
    if (leaderRows.rows?.[0]) {
      throw new Error("Leader nickname already assigned.");
    }

    if (!memberLower.length) return;

    const membersSql = sql.join(memberLower.map((value) => sql`${value}`), sql`, `);
    const memberConflict = await params.tx.execute(sql`
      SELECT member_nickname
      FROM public.admin_group_members
      WHERE lower(member_nickname) IN (${membersSql})
        ${params.groupIdToExclude ? sql`AND admin_group_id <> ${params.groupIdToExclude}::uuid` : sql``}
      LIMIT 1
    `);
    if (memberConflict.rows?.[0]) {
      throw new Error("This nickname is already assigned to another admin group.");
    }

    const leaderConflict = await params.tx.execute(sql`
      SELECT leader_nickname
      FROM public.admin_groups
      WHERE lower(leader_nickname) IN (${membersSql})
        ${params.groupIdToExclude ? sql`AND id <> ${params.groupIdToExclude}::uuid` : sql``}
      LIMIT 1
    `);
    if (leaderConflict.rows?.[0]) {
      throw new Error("Group member conflicts with another group leader.");
    }
  }

  async getCollectionAdminGroups(): Promise<CollectionAdminGroup[]> {
    const nicknameRows = await db.execute(sql`
      SELECT id, nickname
      FROM public.collection_staff_nicknames
      LIMIT 5000
    `);
    const nicknameIdByLowerName = new Map<string, string>();
    for (const row of nicknameRows.rows || []) {
      const nickname = String((row as any).nickname || "").trim().toLowerCase();
      const id = String((row as any).id || "").trim();
      if (!nickname || !id || nicknameIdByLowerName.has(nickname)) continue;
      nicknameIdByLowerName.set(nickname, id);
    }

    const result = await db.execute(sql`
      SELECT
        g.id,
        g.leader_nickname,
        g.created_by,
        g.created_at,
        g.updated_at,
        leader.id AS leader_nickname_id,
        leader.is_active AS leader_is_active,
        leader.role_scope AS leader_role_scope,
        COALESCE(
          array_agg(DISTINCT gm.member_nickname) FILTER (WHERE gm.member_nickname IS NOT NULL),
          ARRAY[]::text[]
        ) AS member_nicknames
      FROM public.admin_groups g
      LEFT JOIN public.collection_staff_nicknames leader
        ON lower(leader.nickname) = lower(g.leader_nickname)
      LEFT JOIN public.admin_group_members gm
        ON gm.admin_group_id = g.id
      GROUP BY
        g.id,
        g.leader_nickname,
        g.created_by,
        g.created_at,
        g.updated_at,
        leader.id,
        leader.is_active,
        leader.role_scope
      ORDER BY lower(g.leader_nickname) ASC
      LIMIT 5000
    `);

    return (result.rows || []).map((row: any) => this.mapCollectionAdminGroupRow(row, nicknameIdByLowerName));
  }

  async getCollectionAdminGroupById(groupId: string): Promise<CollectionAdminGroup | undefined> {
    const normalizedGroupId = String(groupId || "").trim();
    if (!normalizedGroupId) return undefined;
    const groups = await this.getCollectionAdminGroups();
    return groups.find((item) => item.id === normalizedGroupId);
  }

  async createCollectionAdminGroup(params: {
    leaderNicknameId: string;
    memberNicknameIds: string[];
    createdBy: string;
  }): Promise<CollectionAdminGroup> {
    const createdBy = String(params.createdBy || "").trim();
    if (!createdBy) {
      throw new Error("createdBy is required.");
    }
    const createdGroupId = await db.transaction(async (tx) => {
      const leaderRows = await this.resolveNicknameNamesByIds(tx, [params.leaderNicknameId]);
      const leader = leaderRows[0];
      if (!leader || !leader.nickname) {
        throw new Error("Invalid leader nickname.");
      }
      if (!(leader.roleScope === "admin" || leader.roleScope === "both")) {
        throw new Error("Leader nickname must have admin scope.");
      }
      if (!leader.isActive) {
        throw new Error("Leader nickname must be active.");
      }

      const memberRows = await this.resolveNicknameNamesByIds(tx, params.memberNicknameIds || []);
      const memberNicknames = memberRows.map((item) => item.nickname).filter(Boolean);

      await this.validateAdminGroupComposition({
        tx,
        leaderNickname: leader.nickname,
        memberNicknames,
      });

      const groupId = randomUUID();
      await tx.execute(sql`
        INSERT INTO public.admin_groups (
          id,
          leader_nickname,
          created_by,
          created_at,
          updated_at
        )
        VALUES (
          ${groupId}::uuid,
          ${leader.nickname},
          ${createdBy},
          now(),
          now()
        )
      `);

      for (const memberNickname of memberNicknames) {
        if (!memberNickname || memberNickname.toLowerCase() === leader.nickname.toLowerCase()) continue;
        await tx.execute(sql`
          INSERT INTO public.admin_group_members (
            id,
            admin_group_id,
            member_nickname,
            created_at
          )
          VALUES (
            ${randomUUID()}::uuid,
            ${groupId}::uuid,
            ${memberNickname},
            now()
          )
          ON CONFLICT DO NOTHING
        `);
      }
      return groupId;
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
    const groupId = String(params.groupId || "").trim();
    const updatedBy = String(params.updatedBy || "").trim();
    if (!groupId) {
      throw new Error("groupId is required.");
    }
    if (!updatedBy) {
      throw new Error("updatedBy is required.");
    }

    const updatedGroupId = await db.transaction(async (tx) => {
      const existingRow = await tx.execute(sql`
        SELECT id, leader_nickname
        FROM public.admin_groups
        WHERE id = ${groupId}::uuid
        LIMIT 1
      `);
      const existing = existingRow.rows?.[0];
      if (!existing) {
        return null;
      }

      let leaderNickname = String((existing as any).leader_nickname || "").trim();
      if (params.leaderNicknameId) {
        const leaderRows = await this.resolveNicknameNamesByIds(tx, [params.leaderNicknameId]);
        const leader = leaderRows[0];
        if (!leader || !leader.nickname) {
          throw new Error("Invalid leader nickname.");
        }
        if (!(leader.roleScope === "admin" || leader.roleScope === "both")) {
          throw new Error("Leader nickname must have admin scope.");
        }
        if (!leader.isActive) {
          throw new Error("Leader nickname must be active.");
        }
        leaderNickname = leader.nickname;
      }

      let memberNicknames: string[] = [];
      if (params.memberNicknameIds !== undefined) {
        const memberRows = await this.resolveNicknameNamesByIds(tx, params.memberNicknameIds || []);
        memberNicknames = memberRows.map((item) => item.nickname).filter(Boolean);
      } else {
        const existingMembers = await tx.execute(sql`
          SELECT member_nickname
          FROM public.admin_group_members
          WHERE admin_group_id = ${groupId}::uuid
          LIMIT 5000
        `);
        memberNicknames = (existingMembers.rows || [])
          .map((row: any) => String(row.member_nickname || "").trim())
          .filter(Boolean);
      }

      await this.validateAdminGroupComposition({
        tx,
        groupIdToExclude: groupId,
        leaderNickname,
        memberNicknames,
      });

      await tx.execute(sql`
        UPDATE public.admin_groups
        SET
          leader_nickname = ${leaderNickname},
          created_by = COALESCE(NULLIF(trim(COALESCE(created_by, '')), ''), ${updatedBy}),
          updated_at = now()
        WHERE id = ${groupId}::uuid
      `);

      await tx.execute(sql`
        DELETE FROM public.admin_group_members
        WHERE admin_group_id = ${groupId}::uuid
      `);
      for (const memberNickname of memberNicknames) {
        if (!memberNickname || memberNickname.toLowerCase() === leaderNickname.toLowerCase()) continue;
        await tx.execute(sql`
          INSERT INTO public.admin_group_members (
            id,
            admin_group_id,
            member_nickname,
            created_at
          )
          VALUES (
            ${randomUUID()}::uuid,
            ${groupId}::uuid,
            ${memberNickname},
            now()
          )
          ON CONFLICT DO NOTHING
        `);
      }
      return groupId;
    });
    if (!updatedGroupId) return undefined;
    return this.getCollectionAdminGroupById(updatedGroupId);
  }

  async deleteCollectionAdminGroup(groupId: string): Promise<boolean> {
    const normalizedGroupId = String(groupId || "").trim();
    if (!normalizedGroupId) return false;

    return db.transaction(async (tx) => {
      await tx.execute(sql`
        DELETE FROM public.admin_group_members
        WHERE admin_group_id = ${normalizedGroupId}::uuid
      `);
      const result = await tx.execute(sql`
        DELETE FROM public.admin_groups
        WHERE id = ${normalizedGroupId}::uuid
        RETURNING id
      `);
      return Boolean(result.rows?.[0]);
    });
  }

  async getCollectionAdminGroupVisibleNicknameValuesByLeader(leaderNickname: string): Promise<string[]> {
    const normalizedLeader = String(leaderNickname || "").trim();
    if (!normalizedLeader) return [];

    const rows = await db.execute(sql`
      SELECT
        g.leader_nickname,
        COALESCE(
          array_agg(DISTINCT gm.member_nickname) FILTER (WHERE gm.member_nickname IS NOT NULL),
          ARRAY[]::text[]
        ) AS member_nicknames
      FROM public.admin_groups g
      LEFT JOIN public.admin_group_members gm
        ON gm.admin_group_id = g.id
      WHERE lower(g.leader_nickname) = lower(${normalizedLeader})
      GROUP BY g.id, g.leader_nickname
      LIMIT 1
    `);

    const row = rows.rows?.[0];
    if (!row) {
      return [normalizedLeader];
    }

    const members: string[] = Array.isArray((row as any).member_nicknames)
      ? (row as any).member_nicknames.map((value: unknown) => String(value || "").trim()).filter(Boolean)
      : [];
    const uniqueMembers = Array.from(new Set(members.filter((value) => value.toLowerCase() !== normalizedLeader.toLowerCase())))
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    return [String((row as any).leader_nickname || normalizedLeader).trim(), ...uniqueMembers];
  }

  async setCollectionNicknameSession(params: {
    activityId: string;
    username: string;
    userRole: string;
    nickname: string;
  }): Promise<void> {
    const activityId = String(params.activityId || "").trim();
    const username = String(params.username || "").trim();
    const userRole = String(params.userRole || "").trim();
    const nickname = String(params.nickname || "").trim();
    if (!activityId || !username || !userRole || !nickname) {
      throw new Error("Invalid collection nickname session payload.");
    }
    await db.execute(sql`
      INSERT INTO public.collection_nickname_sessions (
        activity_id,
        username,
        user_role,
        nickname,
        verified_at,
        updated_at
      )
      VALUES (
        ${activityId},
        ${username},
        ${userRole},
        ${nickname},
        now(),
        now()
      )
      ON CONFLICT (activity_id) DO UPDATE
      SET
        username = EXCLUDED.username,
        user_role = EXCLUDED.user_role,
        nickname = EXCLUDED.nickname,
        updated_at = now()
    `);
  }

  async getCollectionNicknameSessionByActivity(activityId: string): Promise<CollectionNicknameSession | undefined> {
    const normalizedActivityId = String(activityId || "").trim();
    if (!normalizedActivityId) return undefined;
    const result = await db.execute(sql`
      SELECT
        activity_id,
        username,
        user_role,
        nickname,
        verified_at,
        updated_at
      FROM public.collection_nickname_sessions
      WHERE activity_id = ${normalizedActivityId}
      LIMIT 1
    `);
    const row = result.rows?.[0];
    if (!row) return undefined;
    return this.mapCollectionNicknameSessionRow(row);
  }

  async clearCollectionNicknameSessionByActivity(activityId: string): Promise<void> {
    const normalizedActivityId = String(activityId || "").trim();
    if (!normalizedActivityId) return;
    await db.execute(sql`
      DELETE FROM public.collection_nickname_sessions
      WHERE activity_id = ${normalizedActivityId}
    `);
  }

  async getCollectionStaffNicknameById(id: string): Promise<CollectionStaffNickname | undefined> {
    const result = await db.execute(sql`
      SELECT
        id,
        nickname,
        is_active,
        role_scope,
        created_by,
        created_at
      FROM public.collection_staff_nicknames
      WHERE id = ${id}::uuid
      LIMIT 1
    `);
    const row = result.rows?.[0];
    if (!row) return undefined;
    return this.mapCollectionStaffNicknameRow(row);
  }

  async getCollectionStaffNicknameByName(nickname: string): Promise<CollectionStaffNickname | undefined> {
    const normalized = String(nickname || "").trim();
    if (!normalized) return undefined;

    const result = await db.execute(sql`
      SELECT
        id,
        nickname,
        is_active,
        role_scope,
        created_by,
        created_at
      FROM public.collection_staff_nicknames
      WHERE lower(nickname) = lower(${normalized})
      LIMIT 1
    `);
    const row = result.rows?.[0];
    if (!row) return undefined;
    return this.mapCollectionStaffNicknameRow(row);
  }

  async getCollectionNicknameAuthProfileByName(nickname: string): Promise<CollectionNicknameAuthProfile | undefined> {
    const normalized = String(nickname || "").trim();
    if (!normalized) return undefined;

    const result = await db.execute(sql`
      SELECT
        id,
        nickname,
        is_active,
        role_scope,
        nickname_password_hash,
        must_change_password,
        password_reset_by_superuser,
        password_updated_at
      FROM public.collection_staff_nicknames
      WHERE lower(nickname) = lower(${normalized})
      LIMIT 1
    `);
    const row = result.rows?.[0];
    if (!row) return undefined;
    return this.mapCollectionNicknameAuthProfileRow(row);
  }

  async setCollectionNicknamePassword(params: {
    nicknameId: string;
    passwordHash: string;
    mustChangePassword?: boolean;
    passwordResetBySuperuser?: boolean;
    passwordUpdatedAt?: Date | null;
  }): Promise<void> {
    const nicknameId = String(params.nicknameId || "").trim();
    const passwordHash = String(params.passwordHash || "").trim();
    const mustChangePassword = params.mustChangePassword ?? false;
    const passwordResetBySuperuser = params.passwordResetBySuperuser ?? false;
    const passwordUpdatedAt = params.passwordUpdatedAt ?? new Date();

    if (!nicknameId) {
      throw new Error("nicknameId is required.");
    }
    if (!passwordHash) {
      throw new Error("passwordHash is required.");
    }

    await db.execute(sql`
      UPDATE public.collection_staff_nicknames
      SET
        nickname_password_hash = ${passwordHash},
        must_change_password = ${mustChangePassword},
        password_reset_by_superuser = ${passwordResetBySuperuser},
        password_updated_at = ${passwordUpdatedAt}
      WHERE id = ${nicknameId}::uuid
    `);
  }

  async createCollectionStaffNickname(data: CreateCollectionStaffNicknameInput): Promise<CollectionStaffNickname> {
    const result = await db.execute(sql`
      INSERT INTO public.collection_staff_nicknames (
        id,
        nickname,
        is_active,
        role_scope,
        nickname_password_hash,
        must_change_password,
        password_reset_by_superuser,
        password_updated_at,
        created_by,
        created_at
      )
      VALUES (
        ${randomUUID()}::uuid,
        ${data.nickname},
        true,
        ${normalizeCollectionNicknameRoleScope(data.roleScope)},
        NULL,
        true,
        false,
        NULL,
        ${data.createdBy},
        now()
      )
      RETURNING
        id,
        nickname,
        is_active,
        role_scope,
        created_by,
        created_at
    `);
    return this.mapCollectionStaffNicknameRow(result.rows[0]);
  }

  async updateCollectionStaffNickname(
    id: string,
    data: UpdateCollectionStaffNicknameInput,
  ): Promise<CollectionStaffNickname | undefined> {
    const existing = await this.getCollectionStaffNicknameById(id);
    if (!existing) return undefined;

    const updates: any[] = [];
    if (data.nickname !== undefined) {
      updates.push(sql`nickname = ${data.nickname}`);
    }
    if (data.isActive !== undefined) {
      updates.push(sql`is_active = ${data.isActive}`);
    }
    if (data.roleScope !== undefined) {
      updates.push(sql`role_scope = ${normalizeCollectionNicknameRoleScope(data.roleScope)}`);
    }
    if (!updates.length) {
      return existing;
    }

    return db.transaction(async (tx) => {
      const result = await tx.execute(sql`
        UPDATE public.collection_staff_nicknames
        SET ${sql.join(updates, sql`, `)}
        WHERE id = ${id}::uuid
        RETURNING
          id,
          nickname,
          is_active,
          role_scope,
          created_by,
          created_at
      `);
      const row = result.rows?.[0];
      if (!row) return undefined;

      const updated = this.mapCollectionStaffNicknameRow(row);
      const oldNickname = String(existing.nickname || "").trim();
      const newNickname = String(updated.nickname || "").trim();
      if (oldNickname && newNickname && oldNickname.toLowerCase() !== newNickname.toLowerCase()) {
        await tx.execute(sql`
          UPDATE public.admin_groups
          SET
            leader_nickname = ${newNickname},
            updated_at = now()
          WHERE lower(leader_nickname) = lower(${oldNickname})
        `);
        await tx.execute(sql`
          UPDATE public.admin_group_members
          SET member_nickname = ${newNickname}
          WHERE lower(member_nickname) = lower(${oldNickname})
        `);
        await tx.execute(sql`
          UPDATE public.collection_nickname_sessions
          SET
            nickname = ${newNickname},
            updated_at = now()
          WHERE lower(nickname) = lower(${oldNickname})
        `);
      }
      return updated;
    });
  }

  async deleteCollectionStaffNickname(id: string): Promise<{ deleted: boolean; deactivated: boolean }> {
    const existing = await this.getCollectionStaffNicknameById(id);
    if (!existing) {
      return { deleted: false, deactivated: false };
    }

    const usage = await db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM public.collection_records
      WHERE lower(collection_staff_nickname) = lower(${existing.nickname})
      LIMIT 1
    `);
    const total = Number((usage.rows?.[0] as any)?.total ?? 0);
    if (total > 0) {
      await db.execute(sql`
        UPDATE public.collection_staff_nicknames
        SET is_active = false
        WHERE id = ${id}::uuid
      `);
      return { deleted: false, deactivated: true };
    }

    await db.execute(sql`
      DELETE FROM public.admin_visible_nicknames
      WHERE nickname_id = ${id}::uuid
    `);
    await db.execute(sql`
      DELETE FROM public.admin_group_members
      WHERE lower(member_nickname) = lower(${existing.nickname})
    `);
    await db.execute(sql`
      DELETE FROM public.admin_groups
      WHERE lower(leader_nickname) = lower(${existing.nickname})
    `);
    await db.execute(sql`
      DELETE FROM public.collection_nickname_sessions
      WHERE lower(nickname) = lower(${existing.nickname})
    `);
    await db.execute(sql`
      DELETE FROM public.collection_staff_nicknames
      WHERE id = ${id}::uuid
    `);
    return { deleted: true, deactivated: false };
  }

  async isCollectionStaffNicknameActive(nickname: string): Promise<boolean> {
    const normalized = String(nickname || "").trim();
    if (!normalized) return false;

    const result = await db.execute(sql`
      SELECT id
      FROM public.collection_staff_nicknames
      WHERE lower(nickname) = lower(${normalized})
        AND is_active = true
      LIMIT 1
    `);
    return Boolean(result.rows?.[0]);
  }

  private buildCollectionRecordConditions(filters?: {
    from?: string;
    to?: string;
    search?: string;
    createdByLogin?: string;
    nicknames?: string[];
  }) {
    const conditions: any[] = [];
    if (filters?.from) {
      conditions.push(sql`payment_date >= ${filters.from}::date`);
    }
    if (filters?.to) {
      conditions.push(sql`payment_date <= ${filters.to}::date`);
    }

    const search = String(filters?.search || "").trim();
    if (search) {
      const like = `%${search}%`;
      conditions.push(sql`(
        customer_name ILIKE ${like}
        OR ic_number ILIKE ${like}
        OR account_number ILIKE ${like}
        OR batch ILIKE ${like}
        OR customer_phone ILIKE ${like}
        OR amount::text ILIKE ${like}
      )`);
    }

    const createdByLogin = String(filters?.createdByLogin || "").trim();
    if (createdByLogin) {
      conditions.push(sql`created_by_login = ${createdByLogin}`);
    }

    const nicknameSource = filters?.nicknames;
    const nicknames = Array.isArray(nicknameSource)
      ? nicknameSource
        .map((value) => String(value || "").trim().toLowerCase())
        .filter((value, index, array) => Boolean(value) && array.indexOf(value) === index)
      : [];
    if (nicknames.length > 0) {
      const nicknameSql = sql.join(nicknames.map((value) => sql`${value}`), sql`, `);
      conditions.push(sql`lower(collection_staff_nickname) IN (${nicknameSql})`);
    }

    return conditions;
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
        ${data.receiptFile ?? null},
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
    const conditions = this.buildCollectionRecordConditions(filters);
    const whereSql = conditions.length
      ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
      : sql``;
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
    return this.attachReceipts(records);
  }

  async summarizeCollectionRecords(filters?: {
    from?: string;
    to?: string;
    search?: string;
    createdByLogin?: string;
    nicknames?: string[];
  }): Promise<{ totalRecords: number; totalAmount: number }> {
    const conditions = this.buildCollectionRecordConditions(filters);
    const whereSql = conditions.length
      ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
      : sql``;

    const result = await db.execute(sql`
      SELECT
        COUNT(*)::int AS total_records,
        COALESCE(SUM(amount), 0)::numeric(14,2) AS total_amount
      FROM public.collection_records
      ${whereSql}
    `);

    const row = result.rows?.[0] as any;
    return {
      totalRecords: Number(row?.total_records ?? 0),
      totalAmount: Number(row?.total_amount ?? 0),
    };
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

    const row = result.rows?.[0] as any;
    return {
      totalRecords: Number(row?.total_records ?? 0),
      totalAmount: Number(row?.total_amount ?? 0),
    };
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

      const recordIds = oldRecordRows
        .map((row: any) => String(row.id || "").trim())
        .filter(Boolean);
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

      const receiptPaths = Array.from(
        new Set(
          [
            ...oldRecordRows.map((row: any) => String(row.receipt_file || "").trim()),
            ...(Array.isArray(receiptRowsResult.rows)
              ? receiptRowsResult.rows.map((row: any) => String(row.storage_path || "").trim())
              : []),
          ].filter(Boolean),
        ),
      );

      return {
        totalRecords: oldRecordRows.length,
        totalAmount: oldRecordRows.reduce(
          (sum: number, row: any) => sum + Number(row.amount ?? 0),
          0,
        ),
        receiptPaths,
      };
    });
  }

  async getCollectionMonthlySummary(filters: {
    year: number;
    nicknames?: string[];
    createdByLogin?: string;
  }): Promise<CollectionMonthlySummary[]> {
    const safeYear = Number.isFinite(filters.year)
      ? Math.min(2100, Math.max(2000, Math.floor(filters.year)))
      : new Date().getFullYear();
    const yearStart = `${safeYear}-01-01`;
    const yearEnd = `${safeYear}-12-31`;
    const createdByLogin = String(filters.createdByLogin || "").trim();
    const nicknameSource = filters.nicknames;
    const nicknames = Array.isArray(nicknameSource)
      ? nicknameSource
        .map((value) => String(value || "").trim().toLowerCase())
        .filter((value, index, array) => Boolean(value) && array.indexOf(value) === index)
      : [];

    const conditions: any[] = [
      sql`payment_date >= ${yearStart}::date`,
      sql`payment_date <= ${yearEnd}::date`,
    ];
    if (nicknames.length > 0) {
      const nicknameSql = sql.join(nicknames.map((value) => sql`${value}`), sql`, `);
      conditions.push(sql`lower(collection_staff_nickname) IN (${nicknameSql})`);
    }
    if (createdByLogin) {
      conditions.push(sql`created_by_login = ${createdByLogin}`);
    }

    const whereSql = sql`WHERE ${sql.join(conditions, sql` AND `)}`;
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

    const byMonth = new Map<number, { totalRecords: number; totalAmount: number }>();
    for (const row of result.rows || []) {
      const month = Number((row as any).month ?? 0);
      if (!Number.isFinite(month) || month < 1 || month > 12) continue;
      byMonth.set(month, {
        totalRecords: Number((row as any).total_records ?? 0),
        totalAmount: Number((row as any).total_amount ?? 0),
      });
    }

    return COLLECTION_MONTH_NAMES.map((monthName, index) => {
      const month = index + 1;
      const data = byMonth.get(month);
      return {
        month,
        monthName,
        totalRecords: data?.totalRecords ?? 0,
        totalAmount: data?.totalAmount ?? 0,
      };
    });
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
    const [record] = await this.attachReceipts([this.mapCollectionRecordRow(row)]);
    return record;
  }

  async listCollectionRecordReceipts(recordId: string): Promise<CollectionRecordReceipt[]> {
    const normalizedRecordId = String(recordId || "").trim();
    if (!normalizedRecordId) return [];

    const result = await db.execute(sql`
      SELECT
        id,
        collection_record_id,
        storage_path,
        original_file_name,
        original_mime_type,
        original_extension,
        file_size,
        created_at
      FROM public.collection_record_receipts
      WHERE collection_record_id = ${normalizedRecordId}::uuid
      ORDER BY created_at ASC, id ASC
    `);

    return (result.rows || []).map((row: any) => this.mapCollectionRecordReceiptRow(row));
  }

  async getCollectionRecordReceiptById(
    recordId: string,
    receiptId: string,
  ): Promise<CollectionRecordReceipt | undefined> {
    const normalizedRecordId = String(recordId || "").trim();
    const normalizedReceiptId = String(receiptId || "").trim();
    if (!normalizedRecordId || !normalizedReceiptId) return undefined;

    const result = await db.execute(sql`
      SELECT
        id,
        collection_record_id,
        storage_path,
        original_file_name,
        original_mime_type,
        original_extension,
        file_size,
        created_at
      FROM public.collection_record_receipts
      WHERE collection_record_id = ${normalizedRecordId}::uuid
        AND id = ${normalizedReceiptId}::uuid
      LIMIT 1
    `);
    const row = result.rows?.[0];
    if (!row) return undefined;
    return this.mapCollectionRecordReceiptRow(row);
  }

  async createCollectionRecordReceipts(
    recordId: string,
    receipts: CreateCollectionRecordReceiptInput[],
  ): Promise<CollectionRecordReceipt[]> {
    const normalizedRecordId = String(recordId || "").trim();
    if (!normalizedRecordId || !Array.isArray(receipts) || !receipts.length) {
      return [];
    }

    const insertedIds: string[] = [];
    for (const receipt of receipts) {
      const id = randomUUID();
      insertedIds.push(id);
      await db.execute(sql`
        INSERT INTO public.collection_record_receipts (
          id,
          collection_record_id,
          storage_path,
          original_file_name,
          original_mime_type,
          original_extension,
          file_size,
          created_at
        )
        VALUES (
          ${id}::uuid,
          ${normalizedRecordId}::uuid,
          ${receipt.storagePath},
          ${receipt.originalFileName},
          ${receipt.originalMimeType},
          ${receipt.originalExtension},
          ${receipt.fileSize},
          now()
        )
      `);
    }

    const idSql = sql.join(insertedIds.map((value) => sql`${value}::uuid`), sql`, `);
    const result = await db.execute(sql`
      SELECT
        id,
        collection_record_id,
        storage_path,
        original_file_name,
        original_mime_type,
        original_extension,
        file_size,
        created_at
      FROM public.collection_record_receipts
      WHERE id IN (${idSql})
      ORDER BY created_at ASC, id ASC
    `);
    return (result.rows || []).map((row: any) => this.mapCollectionRecordReceiptRow(row));
  }

  async deleteCollectionRecordReceipts(
    recordId: string,
    receiptIds: string[],
  ): Promise<CollectionRecordReceipt[]> {
    const normalizedRecordId = String(recordId || "").trim();
    const normalizedReceiptIds = Array.from(
      new Set(
        (Array.isArray(receiptIds) ? receiptIds : [])
          .map((value) => String(value || "").trim())
          .filter(Boolean),
      ),
    );
    if (!normalizedRecordId || !normalizedReceiptIds.length) {
      return [];
    }

    const idSql = sql.join(normalizedReceiptIds.map((value) => sql`${value}::uuid`), sql`, `);
    const existing = await db.execute(sql`
      SELECT
        id,
        collection_record_id,
        storage_path,
        original_file_name,
        original_mime_type,
        original_extension,
        file_size,
        created_at
      FROM public.collection_record_receipts
      WHERE collection_record_id = ${normalizedRecordId}::uuid
        AND id IN (${idSql})
    `);
    const receipts = (existing.rows || []).map((row: any) => this.mapCollectionRecordReceiptRow(row));
    if (!receipts.length) {
      return [];
    }

    await db.execute(sql`
      DELETE FROM public.collection_record_receipts
      WHERE collection_record_id = ${normalizedRecordId}::uuid
        AND id IN (${idSql})
    `);
    return receipts;
  }

  async deleteAllCollectionRecordReceipts(recordId: string): Promise<CollectionRecordReceipt[]> {
    const receipts = await this.listCollectionRecordReceipts(recordId);
    if (!receipts.length) {
      return [];
    }
    const idSql = sql.join(receipts.map((receipt) => sql`${receipt.id}::uuid`), sql`, `);
    await db.execute(sql`
      DELETE FROM public.collection_record_receipts
      WHERE id IN (${idSql})
    `);
    return receipts;
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

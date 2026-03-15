import { sql, type SQLWrapper } from "drizzle-orm";
import type {
  CollectionAdminGroup,
  CollectionAdminUser,
  CollectionNicknameAuthProfile,
  CollectionNicknameSession,
  CollectionStaffNickname,
} from "../storage-postgres";

export type CollectionRepositoryQueryResult = {
  rows?: unknown[];
};

export type CollectionRepositoryExecutor = {
  execute: (query: string | SQLWrapper) => Promise<CollectionRepositoryQueryResult>;
};

export type CollectionStaffNicknameDbRow = {
  id?: unknown;
  nickname?: unknown;
  is_active?: unknown;
  isActive?: unknown;
  role_scope?: unknown;
  roleScope?: unknown;
  created_by?: unknown;
  createdBy?: unknown;
  created_at?: unknown;
  createdAt?: unknown;
};

export type CollectionNicknameAuthProfileDbRow = CollectionStaffNicknameDbRow & {
  nickname_password_hash?: unknown;
  nicknamePasswordHash?: unknown;
  must_change_password?: unknown;
  mustChangePassword?: unknown;
  password_reset_by_superuser?: unknown;
  passwordResetBySuperuser?: unknown;
  password_updated_at?: unknown;
  passwordUpdatedAt?: unknown;
};

export type CollectionAdminUserDbRow = {
  id?: unknown;
  username?: unknown;
  is_banned?: unknown;
  isBanned?: unknown;
  created_at?: unknown;
  createdAt?: unknown;
  updated_at?: unknown;
  updatedAt?: unknown;
};

export type CollectionAdminGroupDbRow = {
  id?: unknown;
  leader_nickname?: unknown;
  leaderNickname?: unknown;
  leader_nickname_id?: unknown;
  leaderNicknameId?: unknown;
  leader_is_active?: unknown;
  leaderIsActive?: unknown;
  leader_role_scope?: unknown;
  leaderRoleScope?: unknown;
  member_nicknames?: unknown;
  memberNicknames?: unknown;
  created_by?: unknown;
  createdBy?: unknown;
  created_at?: unknown;
  createdAt?: unknown;
  updated_at?: unknown;
  updatedAt?: unknown;
};

export type CollectionNicknameSessionDbRow = {
  activity_id?: unknown;
  activityId?: unknown;
  username?: unknown;
  user_role?: unknown;
  userRole?: unknown;
  nickname?: unknown;
  verified_at?: unknown;
  verifiedAt?: unknown;
  updated_at?: unknown;
  updatedAt?: unknown;
};

type CollectionNicknameLookupRow = {
  id?: unknown;
  nickname?: unknown;
  role_scope?: unknown;
  is_active?: unknown;
};

function normalizeCollectionDate(value: unknown, fallback = Date.now()): Date {
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === "string" || typeof value === "number") {
    return new Date(value);
  }
  return new Date(fallback);
}

function normalizeNullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function normalizeNullableBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined) {
    return null;
  }
  return Boolean(value);
}

function readRows<TRow>(result: CollectionRepositoryQueryResult): TRow[] {
  return Array.isArray(result.rows) ? (result.rows as TRow[]) : [];
}

export function normalizeCollectionNicknameRoleScope(value: unknown): "admin" | "user" | "both" {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "admin" || normalized === "user" || normalized === "both") {
    return normalized;
  }
  return "both";
}

export function mapCollectionStaffNicknameRow(row: CollectionStaffNicknameDbRow): CollectionStaffNickname {
  return {
    id: String(row.id ?? ""),
    nickname: String(row.nickname ?? ""),
    isActive: Boolean(row.is_active ?? row.isActive),
    roleScope: normalizeCollectionNicknameRoleScope(row.role_scope ?? row.roleScope),
    createdBy: normalizeNullableText(row.created_by ?? row.createdBy),
    createdAt: normalizeCollectionDate(row.created_at ?? row.createdAt),
  };
}

export function mapCollectionNicknameAuthProfileRow(
  row: CollectionNicknameAuthProfileDbRow,
): CollectionNicknameAuthProfile {
  const passwordUpdatedAtRaw = row.password_updated_at ?? row.passwordUpdatedAt ?? null;
  const passwordUpdatedAt = passwordUpdatedAtRaw === null || passwordUpdatedAtRaw === undefined
    ? null
    : normalizeCollectionDate(passwordUpdatedAtRaw);

  return {
    id: String(row.id ?? ""),
    nickname: String(row.nickname ?? ""),
    isActive: Boolean(row.is_active ?? row.isActive),
    roleScope: normalizeCollectionNicknameRoleScope(row.role_scope ?? row.roleScope),
    mustChangePassword: Boolean(row.must_change_password ?? row.mustChangePassword ?? true),
    passwordResetBySuperuser: Boolean(row.password_reset_by_superuser ?? row.passwordResetBySuperuser ?? false),
    nicknamePasswordHash: normalizeNullableText(row.nickname_password_hash ?? row.nicknamePasswordHash),
    passwordUpdatedAt,
  };
}

export function mapCollectionAdminUserRow(row: CollectionAdminUserDbRow): CollectionAdminUser {
  return {
    id: String(row.id ?? ""),
    username: String(row.username ?? ""),
    role: "admin",
    isBanned: normalizeNullableBoolean(row.is_banned ?? row.isBanned),
    createdAt: normalizeCollectionDate(row.created_at ?? row.createdAt),
    updatedAt: normalizeCollectionDate(row.updated_at ?? row.updatedAt),
  };
}

export function mapCollectionAdminGroupRow(
  row: CollectionAdminGroupDbRow,
  nicknameIdByLowerName: Map<string, string>,
): CollectionAdminGroup {
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
    createdBy: normalizeNullableText(row.created_by ?? row.createdBy),
    createdAt: normalizeCollectionDate(row.created_at ?? row.createdAt),
    updatedAt: normalizeCollectionDate(row.updated_at ?? row.updatedAt),
  };
}

export function mapCollectionNicknameSessionRow(row: CollectionNicknameSessionDbRow): CollectionNicknameSession {
  const verifiedAtRaw = row.verified_at ?? row.verifiedAt;
  const updatedAtRaw = row.updated_at ?? row.updatedAt;
  return {
    activityId: String(row.activity_id ?? row.activityId ?? ""),
    username: String(row.username ?? ""),
    userRole: String(row.user_role ?? row.userRole ?? ""),
    nickname: String(row.nickname ?? ""),
    verifiedAt: normalizeCollectionDate(verifiedAtRaw),
    updatedAt: normalizeCollectionDate(updatedAtRaw),
  };
}

export async function resolveCollectionNicknameRowsByIds(
  tx: CollectionRepositoryExecutor,
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
  const rows = readRows<CollectionNicknameLookupRow>(result).map((row) => ({
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

export async function validateCollectionAdminGroupComposition(params: {
  tx: CollectionRepositoryExecutor;
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

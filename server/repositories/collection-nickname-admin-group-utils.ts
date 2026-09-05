import { sql } from "drizzle-orm";
import {
  normalizeCollectionNicknameRoleScope,
  readRows,
} from "./collection-nickname-shared-utils";
import type {
  CollectionNicknameLookupRow,
  CollectionRepositoryExecutor,
} from "./collection-nickname-types";

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
  leaderNicknameId: string;
  memberNicknameIds: string[];
}): Promise<void> {
  const leaderNicknameId = String(params.leaderNicknameId || "").trim().toLowerCase();
  const uniqueMembers = Array.from(
    new Set(
      params.memberNicknameIds
        .map((value) => String(value || "").trim().toLowerCase())
        .filter(Boolean),
    ),
  );

  if (uniqueMembers.includes(leaderNicknameId)) {
    throw new Error("Leader nickname cannot be a member of the same group.");
  }

  const leaderRows = await params.tx.execute(sql`
    SELECT id
    FROM public.admin_groups
    WHERE leader_nickname_id = ${leaderNicknameId}::uuid
      ${params.groupIdToExclude ? sql`AND id <> ${params.groupIdToExclude}::uuid` : sql``}
    LIMIT 1
  `);
  if (leaderRows.rows?.[0]) {
    throw new Error("Leader nickname already assigned.");
  }

  if (!uniqueMembers.length) return;

  const membersSql = sql.join(uniqueMembers.map((value) => sql`${value}::uuid`), sql`, `);
  const memberConflict = await params.tx.execute(sql`
    SELECT member_nickname_id
    FROM public.admin_group_members
    WHERE member_nickname_id IN (${membersSql})
      ${params.groupIdToExclude ? sql`AND admin_group_id <> ${params.groupIdToExclude}::uuid` : sql``}
    LIMIT 1
  `);
  if (memberConflict.rows?.[0]) {
    throw new Error("This nickname is already assigned to another admin group.");
  }

  const leaderConflict = await params.tx.execute(sql`
    SELECT leader_nickname_id
    FROM public.admin_groups
    WHERE leader_nickname_id IN (${membersSql})
      ${params.groupIdToExclude ? sql`AND id <> ${params.groupIdToExclude}::uuid` : sql``}
    LIMIT 1
  `);
  if (leaderConflict.rows?.[0]) {
    throw new Error("Group member conflicts with another group leader.");
  }
}

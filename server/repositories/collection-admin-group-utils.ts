import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import {
  mapCollectionAdminGroupRow,
  resolveCollectionNicknameRowsByIds,
  validateCollectionAdminGroupComposition,
  type CollectionAdminGroupDbRow,
} from "./collection-nickname-utils";
import {
  insertAdminGroupMembers,
  normalizeCollectionText,
  normalizeVisibleNicknameValues,
  readFirstRow,
  readRows,
} from "./collection-admin-group-shared";
import type {
  CollectionAdminGroupExecutor,
  CollectionExistingAdminGroupRow,
  CollectionVisibleNicknameRow,
} from "./collection-admin-group-types";
import type { CollectionAdminGroup } from "../storage-postgres";

export type { CollectionAdminGroupExecutor } from "./collection-admin-group-types";

export async function listCollectionAdminGroups(
  executor: CollectionAdminGroupExecutor,
): Promise<CollectionAdminGroup[]> {
  const result = await executor.execute(sql`
    SELECT
      g.id,
      leader.nickname AS leader_nickname,
      g.leader_nickname_id,
      g.created_by,
      g.created_at,
      g.updated_at,
      leader.is_active AS leader_is_active,
      leader.role_scope AS leader_role_scope,
      COALESCE(
        array_agg(DISTINCT member_nickname.nickname)
          FILTER (WHERE member_nickname.id IS NOT NULL),
        ARRAY[]::text[]
      ) AS member_nicknames,
      COALESCE(
        array_agg(DISTINCT gm.member_nickname_id::text)
          FILTER (WHERE member_nickname.id IS NOT NULL),
        ARRAY[]::text[]
      ) AS member_nickname_ids
    FROM public.admin_groups g
    JOIN public.collection_staff_nicknames leader
      ON leader.id = g.leader_nickname_id
    LEFT JOIN public.admin_group_members gm
      ON gm.admin_group_id = g.id
    LEFT JOIN public.collection_staff_nicknames member_nickname
      ON member_nickname.id = gm.member_nickname_id
    GROUP BY
      g.id,
      g.leader_nickname_id,
      leader.nickname,
      g.created_by,
      g.created_at,
      g.updated_at,
      leader.is_active,
      leader.role_scope
    ORDER BY lower(g.leader_nickname) ASC
    LIMIT 5000
  `);

  return readRows<CollectionAdminGroupDbRow>(result).map((row) => mapCollectionAdminGroupRow(row));
}

export async function findCollectionAdminGroupById(
  executor: CollectionAdminGroupExecutor,
  groupId: string,
): Promise<CollectionAdminGroup | undefined> {
  const normalizedGroupId = normalizeCollectionText(groupId);
  if (!normalizedGroupId) return undefined;
  const groups = await listCollectionAdminGroups(executor);
  return groups.find((item) => item.id === normalizedGroupId);
}

export async function createCollectionAdminGroupInTransaction(
  executor: CollectionAdminGroupExecutor,
  params: {
    leaderNicknameId: string;
    memberNicknameIds: string[];
    createdBy: string;
  },
): Promise<string> {
  const createdBy = normalizeCollectionText(params.createdBy);
  if (!createdBy) {
    throw new Error("createdBy is required.");
  }

  const leaderRows = await resolveCollectionNicknameRowsByIds(executor, [params.leaderNicknameId]);
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

  const memberRows = await resolveCollectionNicknameRowsByIds(executor, params.memberNicknameIds || []);
  if (memberRows.some((item) => !item.isActive)) {
    throw new Error("Group member nicknames must be active.");
  }

  await validateCollectionAdminGroupComposition({
    tx: executor,
    leaderNicknameId: leader.id,
    memberNicknameIds: memberRows.map((item) => item.id),
  });

  const groupId = randomUUID();
  await executor.execute(sql`
    INSERT INTO public.admin_groups (
      id,
      leader_nickname_id,
      leader_nickname,
      created_by,
      created_at,
      updated_at
    )
    VALUES (
      ${groupId}::uuid,
      ${leader.id}::uuid,
      ${leader.nickname},
      ${createdBy},
      now(),
      now()
    )
  `);

  await insertAdminGroupMembers(executor, groupId, leader.id, memberRows);
  return groupId;
}

export async function updateCollectionAdminGroupInTransaction(
  executor: CollectionAdminGroupExecutor,
  params: {
    groupId: string;
    leaderNicknameId?: string | undefined;
    memberNicknameIds?: string[] | undefined;
    updatedBy: string;
  },
): Promise<string | null> {
  const groupId = normalizeCollectionText(params.groupId);
  const updatedBy = normalizeCollectionText(params.updatedBy);
  if (!groupId) {
    throw new Error("groupId is required.");
  }
  if (!updatedBy) {
    throw new Error("updatedBy is required.");
  }

  const existingRow = await executor.execute(sql`
    SELECT id, leader_nickname_id, leader_nickname
    FROM public.admin_groups
    WHERE id = ${groupId}::uuid
    LIMIT 1
  `);
  const existing = readFirstRow<CollectionExistingAdminGroupRow>(existingRow);
  if (!existing) {
    return null;
  }

  let leaderNicknameId = normalizeCollectionText(existing.leader_nickname_id);
  let leaderNickname = normalizeCollectionText(existing.leader_nickname);
  if (params.leaderNicknameId) {
    const leaderRows = await resolveCollectionNicknameRowsByIds(executor, [params.leaderNicknameId]);
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
    leaderNicknameId = leader.id;
    leaderNickname = leader.nickname;
  }
  if (!leaderNicknameId) {
    throw new Error("Existing group has no stable leader nickname identity.");
  }

  let memberRows: Array<{ id: string; nickname: string; roleScope: "admin" | "user" | "both"; isActive: boolean }> = [];
  if (params.memberNicknameIds !== undefined) {
    memberRows = await resolveCollectionNicknameRowsByIds(executor, params.memberNicknameIds || []);
  } else {
    const existingMembers = await executor.execute(sql`
      SELECT nickname.id, nickname.nickname, nickname.role_scope, nickname.is_active
      FROM public.admin_group_members member
      JOIN public.collection_staff_nicknames nickname
        ON nickname.id = member.member_nickname_id
      WHERE member.admin_group_id = ${groupId}::uuid
      LIMIT 5000
    `);
    memberRows = readRows<Record<string, unknown>>(existingMembers).map((row) => ({
      id: normalizeCollectionText(row.id),
      nickname: normalizeCollectionText(row.nickname),
      roleScope: row.role_scope === "admin"
        ? "admin" as const
        : row.role_scope === "both"
          ? "both" as const
          : "user" as const,
      isActive: Boolean(row.is_active),
    })).filter((row) => row.id && row.nickname);
  }
  if (memberRows.some((item) => !item.isActive)) {
    throw new Error("Group member nicknames must be active.");
  }

  await validateCollectionAdminGroupComposition({
    tx: executor,
    groupIdToExclude: groupId,
    leaderNicknameId,
    memberNicknameIds: memberRows.map((item) => item.id),
  });

  await executor.execute(sql`
    UPDATE public.admin_groups
    SET
      leader_nickname_id = ${leaderNicknameId}::uuid,
      leader_nickname = ${leaderNickname},
      created_by = COALESCE(NULLIF(trim(COALESCE(created_by, '')), ''), ${updatedBy}),
      updated_at = now()
    WHERE id = ${groupId}::uuid
  `);

  await executor.execute(sql`
    DELETE FROM public.admin_group_members
    WHERE admin_group_id = ${groupId}::uuid
  `);
  await insertAdminGroupMembers(executor, groupId, leaderNicknameId, memberRows);

  return groupId;
}

export async function deleteCollectionAdminGroupInTransaction(
  executor: CollectionAdminGroupExecutor,
  groupId: string,
): Promise<boolean> {
  const normalizedGroupId = normalizeCollectionText(groupId);
  if (!normalizedGroupId) return false;

  await executor.execute(sql`
    DELETE FROM public.admin_group_members
    WHERE admin_group_id = ${normalizedGroupId}::uuid
  `);
  const result = await executor.execute(sql`
    DELETE FROM public.admin_groups
    WHERE id = ${normalizedGroupId}::uuid
    RETURNING id
  `);
  return Boolean(result.rows?.[0]);
}

export async function getCollectionAdminGroupVisibleNicknameValuesByLeader(
  executor: CollectionAdminGroupExecutor,
  leaderNickname: string,
): Promise<string[]> {
  const normalizedLeader = normalizeCollectionText(leaderNickname);
  if (!normalizedLeader) return [];

  const rows = await executor.execute(sql`
    SELECT
      leader.nickname AS leader_nickname,
      COALESCE(
        array_agg(DISTINCT member_nickname.nickname)
          FILTER (WHERE member_nickname.id IS NOT NULL AND member_nickname.is_active = true),
        ARRAY[]::text[]
      ) AS member_nicknames
    FROM public.admin_groups g
    JOIN public.collection_staff_nicknames leader
      ON leader.id = g.leader_nickname_id
      AND leader.is_active = true
    LEFT JOIN public.admin_group_members gm
      ON gm.admin_group_id = g.id
    LEFT JOIN public.collection_staff_nicknames member_nickname
      ON member_nickname.id = gm.member_nickname_id
    WHERE lower(leader.nickname) = lower(${normalizedLeader})
    GROUP BY g.id, leader.nickname
    LIMIT 1
  `);

  const row = readFirstRow<CollectionVisibleNicknameRow>(rows);
  if (!row) {
    return [normalizedLeader];
  }
  return normalizeVisibleNicknameValues(
    normalizeCollectionText(row.leader_nickname || normalizedLeader),
    row.member_nicknames,
  );
}

import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import {
  mapCollectionAdminGroupRow,
  resolveCollectionNicknameRowsByIds,
  validateCollectionAdminGroupComposition,
  type CollectionAdminGroupDbRow,
} from "./collection-nickname-utils";
import {
  buildNicknameIdByLowerName,
  insertAdminGroupMembers,
  normalizeCollectionText,
  normalizeVisibleNicknameValues,
  readFirstRow,
  readRows,
} from "./collection-admin-group-shared";
import type {
  CollectionAdminGroupExecutor,
  CollectionAdminGroupMemberRow,
  CollectionExistingAdminGroupRow,
  CollectionNicknameIdRow,
  CollectionVisibleNicknameRow,
} from "./collection-admin-group-types";
import type { CollectionAdminGroup } from "../storage-postgres";

export type { CollectionAdminGroupExecutor } from "./collection-admin-group-types";

export async function listCollectionAdminGroups(
  executor: CollectionAdminGroupExecutor,
): Promise<CollectionAdminGroup[]> {
  const nicknameRows = await executor.execute(sql`
    SELECT id, nickname
    FROM public.collection_staff_nicknames
    LIMIT 5000
  `);
  const nicknameIdByLowerName = buildNicknameIdByLowerName(readRows<CollectionNicknameIdRow>(nicknameRows));

  const result = await executor.execute(sql`
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

  return readRows<CollectionAdminGroupDbRow>(result).map((row) => mapCollectionAdminGroupRow(row, nicknameIdByLowerName));
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
  const memberNicknames = memberRows.map((item) => item.nickname).filter(Boolean);

  await validateCollectionAdminGroupComposition({
    tx: executor,
    leaderNickname: leader.nickname,
    memberNicknames,
  });

  const groupId = randomUUID();
  await executor.execute(sql`
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

  await insertAdminGroupMembers(executor, groupId, leader.nickname, memberNicknames);
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
    SELECT id, leader_nickname
    FROM public.admin_groups
    WHERE id = ${groupId}::uuid
    LIMIT 1
  `);
  const existing = readFirstRow<CollectionExistingAdminGroupRow>(existingRow);
  if (!existing) {
    return null;
  }

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
    leaderNickname = leader.nickname;
  }

  let memberNicknames: string[] = [];
  if (params.memberNicknameIds !== undefined) {
    const memberRows = await resolveCollectionNicknameRowsByIds(executor, params.memberNicknameIds || []);
    memberNicknames = memberRows.map((item) => item.nickname).filter(Boolean);
  } else {
    const existingMembers = await executor.execute(sql`
      SELECT member_nickname
      FROM public.admin_group_members
      WHERE admin_group_id = ${groupId}::uuid
      LIMIT 5000
    `);
    memberNicknames = readRows<CollectionAdminGroupMemberRow>(existingMembers)
      .map((row) => normalizeCollectionText(row.member_nickname))
      .filter(Boolean);
  }

  await validateCollectionAdminGroupComposition({
    tx: executor,
    groupIdToExclude: groupId,
    leaderNickname,
    memberNicknames,
  });

  await executor.execute(sql`
    UPDATE public.admin_groups
    SET
      leader_nickname = ${leaderNickname},
      created_by = COALESCE(NULLIF(trim(COALESCE(created_by, '')), ''), ${updatedBy}),
      updated_at = now()
    WHERE id = ${groupId}::uuid
  `);

  await executor.execute(sql`
    DELETE FROM public.admin_group_members
    WHERE admin_group_id = ${groupId}::uuid
  `);
  await insertAdminGroupMembers(executor, groupId, leaderNickname, memberNicknames);

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

  const row = readFirstRow<CollectionVisibleNicknameRow>(rows);
  if (!row) {
    return [normalizedLeader];
  }
  return normalizeVisibleNicknameValues(
    normalizeCollectionText(row.leader_nickname || normalizedLeader),
    row.member_nicknames,
  );
}

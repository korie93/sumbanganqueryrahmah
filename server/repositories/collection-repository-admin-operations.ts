import { sql } from "drizzle-orm";

import { db } from "../db-postgres";
import type {
  CollectionAdminGroup,
  CollectionAdminUser,
  CollectionStaffNickname,
} from "../storage-postgres";
import {
  listCollectionAdminAssignedNicknameIds,
  listCollectionAdminVisibleNicknames,
  replaceCollectionAdminAssignedNicknameIds,
} from "./collection-admin-assignment-utils";
import {
  createCollectionAdminGroupInTransaction,
  deleteCollectionAdminGroupInTransaction,
  findCollectionAdminGroupById,
  getCollectionAdminGroupVisibleNicknameValuesByLeader,
  listCollectionAdminGroups,
  updateCollectionAdminGroupInTransaction,
} from "./collection-admin-group-utils";
import { mapCollectionAdminUserRow } from "./collection-nickname-utils";

export async function getCollectionAdminUsersRepository(): Promise<CollectionAdminUser[]> {
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

export async function getCollectionAdminUserByIdRepository(
  adminUserId: string,
): Promise<CollectionAdminUser | undefined> {
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

export async function getCollectionAdminAssignedNicknameIdsRepository(
  adminUserId: string,
): Promise<string[]> {
  return listCollectionAdminAssignedNicknameIds(db, adminUserId);
}

export async function getCollectionAdminVisibleNicknamesRepository(
  adminUserId: string,
  filters?: { activeOnly?: boolean; allowedRole?: "admin" | "user" },
): Promise<CollectionStaffNickname[]> {
  return listCollectionAdminVisibleNicknames(db, adminUserId, filters);
}

export async function setCollectionAdminAssignedNicknameIdsRepository(params: {
  adminUserId: string;
  nicknameIds: string[];
  createdBySuperuser: string;
}): Promise<string[]> {
  return db.transaction(async (tx) => {
    return replaceCollectionAdminAssignedNicknameIds(tx, params);
  });
}

export async function getCollectionAdminGroupsRepository(): Promise<CollectionAdminGroup[]> {
  return listCollectionAdminGroups(db);
}

export async function getCollectionAdminGroupByIdRepository(
  groupId: string,
): Promise<CollectionAdminGroup | undefined> {
  return findCollectionAdminGroupById(db, groupId);
}

export async function createCollectionAdminGroupRepository(params: {
  leaderNicknameId: string;
  memberNicknameIds: string[];
  createdBy: string;
}): Promise<CollectionAdminGroup> {
  const createdGroupId = await db.transaction(async (tx) => {
    return createCollectionAdminGroupInTransaction(tx, params);
  });
  const created = await getCollectionAdminGroupByIdRepository(createdGroupId);
  if (!created) {
    throw new Error("Failed to create admin group.");
  }
  return created;
}

export async function updateCollectionAdminGroupRepository(params: {
  groupId: string;
  leaderNicknameId?: string | undefined;
  memberNicknameIds?: string[] | undefined;
  updatedBy: string;
}): Promise<CollectionAdminGroup | undefined> {
  const updatedGroupId = await db.transaction(async (tx) => {
    return updateCollectionAdminGroupInTransaction(tx, params);
  });
  if (!updatedGroupId) return undefined;
  return getCollectionAdminGroupByIdRepository(updatedGroupId);
}

export async function deleteCollectionAdminGroupRepository(groupId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    return deleteCollectionAdminGroupInTransaction(tx, groupId);
  });
}

export async function getCollectionAdminGroupVisibleNicknameValuesByLeaderRepository(
  leaderNickname: string,
): Promise<string[]> {
  return getCollectionAdminGroupVisibleNicknameValuesByLeader(db, leaderNickname);
}

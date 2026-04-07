import { sql, type SQL } from "drizzle-orm";

import {
  mapCollectionNicknameAuthProfileRow,
  mapCollectionStaffNicknameRow,
  type CollectionNicknameAuthProfileDbRow,
  type CollectionStaffNicknameDbRow,
} from "./collection-nickname-utils";
import {
  normalizeCollectionText,
  readFirstRow,
  readRows,
  type CollectionStaffNicknameExecutor,
} from "./collection-staff-nickname-shared";
import type {
  CollectionNicknameAuthProfile,
  CollectionStaffNickname,
} from "../storage-postgres";

export async function listCollectionStaffNicknames(
  executor: CollectionStaffNicknameExecutor,
  filters?: {
    activeOnly?: boolean;
    allowedRole?: "admin" | "user";
  },
): Promise<CollectionStaffNickname[]> {
  const conditions: SQL[] = [];
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

  const result = await executor.execute(sql`
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

  return readRows<CollectionStaffNicknameDbRow>(result).map((row) => mapCollectionStaffNicknameRow(row));
}

export async function getCollectionStaffNicknameByIdValue(
  executor: CollectionStaffNicknameExecutor,
  id: string,
): Promise<CollectionStaffNickname | undefined> {
  const normalizedId = normalizeCollectionText(id);
  if (!normalizedId) return undefined;

  const result = await executor.execute(sql`
    SELECT
      id,
      nickname,
      is_active,
      role_scope,
      created_by,
      created_at
    FROM public.collection_staff_nicknames
    WHERE id = ${normalizedId}::uuid
    LIMIT 1
  `);
  const row = readFirstRow<CollectionStaffNicknameDbRow>(result);
  if (!row) return undefined;
  return mapCollectionStaffNicknameRow(row);
}

export async function getCollectionStaffNicknameByNameValue(
  executor: CollectionStaffNicknameExecutor,
  nickname: string,
): Promise<CollectionStaffNickname | undefined> {
  const normalized = normalizeCollectionText(nickname);
  if (!normalized) return undefined;

  const result = await executor.execute(sql`
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
  const row = readFirstRow<CollectionStaffNicknameDbRow>(result);
  if (!row) return undefined;
  return mapCollectionStaffNicknameRow(row);
}

export async function getCollectionNicknameAuthProfileByNameValue(
  executor: CollectionStaffNicknameExecutor,
  nickname: string,
): Promise<CollectionNicknameAuthProfile | undefined> {
  const normalized = normalizeCollectionText(nickname);
  if (!normalized) return undefined;

  const result = await executor.execute(sql`
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
  const row = readFirstRow<CollectionNicknameAuthProfileDbRow>(result);
  if (!row) return undefined;
  return mapCollectionNicknameAuthProfileRow(row);
}

export async function isCollectionStaffNicknameActiveValue(
  executor: CollectionStaffNicknameExecutor,
  nickname: string,
): Promise<boolean> {
  const normalized = normalizeCollectionText(nickname);
  if (!normalized) return false;

  const result = await executor.execute(sql`
    SELECT id
    FROM public.collection_staff_nicknames
    WHERE lower(nickname) = lower(${normalized})
      AND is_active = true
    LIMIT 1
  `);
  return Boolean(readFirstRow<{ id?: unknown }>(result));
}

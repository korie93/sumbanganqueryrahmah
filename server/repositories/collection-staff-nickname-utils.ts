import { randomUUID } from "crypto";
import { sql, type SQL } from "drizzle-orm";
import {
  mapCollectionNicknameAuthProfileRow,
  mapCollectionNicknameSessionRow,
  mapCollectionStaffNicknameRow,
  normalizeCollectionNicknameRoleScope,
  type CollectionNicknameAuthProfileDbRow,
  type CollectionNicknameSessionDbRow,
  type CollectionRepositoryExecutor,
  type CollectionRepositoryQueryResult,
  type CollectionStaffNicknameDbRow,
} from "./collection-nickname-utils";
import type {
  CollectionNicknameAuthProfile,
  CollectionNicknameSession,
  CollectionStaffNickname,
  CreateCollectionStaffNicknameInput,
  UpdateCollectionStaffNicknameInput,
} from "../storage-postgres";

type CollectionRecordCountRow = {
  total?: unknown;
};

export type CollectionStaffNicknameExecutor = CollectionRepositoryExecutor;

function normalizeCollectionText(value: unknown): string {
  return String(value || "").trim();
}

function readRows<TRow>(result: CollectionRepositoryQueryResult): TRow[] {
  return Array.isArray(result.rows) ? (result.rows as TRow[]) : [];
}

function readFirstRow<TRow>(result: CollectionRepositoryQueryResult): TRow | undefined {
  return readRows<TRow>(result)[0];
}

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

export async function setCollectionNicknameSessionValue(
  executor: CollectionStaffNicknameExecutor,
  params: {
    activityId: string;
    username: string;
    userRole: string;
    nickname: string;
  },
): Promise<void> {
  const activityId = normalizeCollectionText(params.activityId);
  const username = normalizeCollectionText(params.username);
  const userRole = normalizeCollectionText(params.userRole);
  const nickname = normalizeCollectionText(params.nickname);
  if (!activityId || !username || !userRole || !nickname) {
    throw new Error("Invalid collection nickname session payload.");
  }
  await executor.execute(sql`
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

export async function getCollectionNicknameSessionValueByActivity(
  executor: CollectionStaffNicknameExecutor,
  activityId: string,
): Promise<CollectionNicknameSession | undefined> {
  const normalizedActivityId = normalizeCollectionText(activityId);
  if (!normalizedActivityId) return undefined;
  const result = await executor.execute(sql`
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
  const row = readFirstRow<CollectionNicknameSessionDbRow>(result);
  if (!row) return undefined;
  return mapCollectionNicknameSessionRow(row);
}

export async function clearCollectionNicknameSessionValueByActivity(
  executor: CollectionStaffNicknameExecutor,
  activityId: string,
): Promise<void> {
  const normalizedActivityId = normalizeCollectionText(activityId);
  if (!normalizedActivityId) return;
  await executor.execute(sql`
    DELETE FROM public.collection_nickname_sessions
    WHERE activity_id = ${normalizedActivityId}
  `);
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

export async function setCollectionNicknamePasswordValue(
  executor: CollectionStaffNicknameExecutor,
  params: {
    nicknameId: string;
    passwordHash: string;
    mustChangePassword?: boolean;
    passwordResetBySuperuser?: boolean;
    passwordUpdatedAt?: Date | null;
  },
): Promise<void> {
  const nicknameId = normalizeCollectionText(params.nicknameId);
  const passwordHash = normalizeCollectionText(params.passwordHash);
  const mustChangePassword = params.mustChangePassword ?? false;
  const passwordResetBySuperuser = params.passwordResetBySuperuser ?? false;
  const passwordUpdatedAt = params.passwordUpdatedAt ?? new Date();

  if (!nicknameId) {
    throw new Error("nicknameId is required.");
  }
  if (!passwordHash) {
    throw new Error("passwordHash is required.");
  }

  await executor.execute(sql`
    UPDATE public.collection_staff_nicknames
    SET
      nickname_password_hash = ${passwordHash},
      must_change_password = ${mustChangePassword},
      password_reset_by_superuser = ${passwordResetBySuperuser},
      password_updated_at = ${passwordUpdatedAt}
    WHERE id = ${nicknameId}::uuid
  `);
}

export async function createCollectionStaffNicknameValue(
  executor: CollectionStaffNicknameExecutor,
  data: CreateCollectionStaffNicknameInput,
): Promise<CollectionStaffNickname> {
  const result = await executor.execute(sql`
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
  const row = readFirstRow<CollectionStaffNicknameDbRow>(result);
  if (!row) {
    throw new Error("Failed to create collection staff nickname.");
  }
  return mapCollectionStaffNicknameRow(row);
}

export async function updateCollectionStaffNicknameValue(
  executor: CollectionStaffNicknameExecutor,
  id: string,
  data: UpdateCollectionStaffNicknameInput,
): Promise<CollectionStaffNickname | undefined> {
  const existing = await getCollectionStaffNicknameByIdValue(executor, id);
  if (!existing) return undefined;

  const updates: SQL[] = [];
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

  const result = await executor.execute(sql`
    UPDATE public.collection_staff_nicknames
    SET ${sql.join(updates, sql`, `)}
    WHERE id = ${normalizeCollectionText(id)}::uuid
    RETURNING
      id,
      nickname,
      is_active,
      role_scope,
      created_by,
      created_at
  `);
  const row = readFirstRow<CollectionStaffNicknameDbRow>(result);
  if (!row) return undefined;

  const updated = mapCollectionStaffNicknameRow(row);
  const oldNickname = normalizeCollectionText(existing.nickname);
  const newNickname = normalizeCollectionText(updated.nickname);
  if (oldNickname && newNickname && oldNickname.toLowerCase() !== newNickname.toLowerCase()) {
    await executor.execute(sql`
      UPDATE public.admin_groups
      SET
        leader_nickname = ${newNickname},
        updated_at = now()
      WHERE lower(leader_nickname) = lower(${oldNickname})
    `);
    await executor.execute(sql`
      UPDATE public.admin_group_members
      SET member_nickname = ${newNickname}
      WHERE lower(member_nickname) = lower(${oldNickname})
    `);
    await executor.execute(sql`
      UPDATE public.collection_nickname_sessions
      SET
        nickname = ${newNickname},
        updated_at = now()
      WHERE lower(nickname) = lower(${oldNickname})
    `);
  }
  return updated;
}

export async function deleteCollectionStaffNicknameValue(
  executor: CollectionStaffNicknameExecutor,
  id: string,
): Promise<{ deleted: boolean; deactivated: boolean }> {
  const existing = await getCollectionStaffNicknameByIdValue(executor, id);
  if (!existing) {
    return { deleted: false, deactivated: false };
  }

  const usage = await executor.execute(sql`
    SELECT COUNT(*)::int AS total
    FROM public.collection_records
    WHERE lower(collection_staff_nickname) = lower(${existing.nickname})
    LIMIT 1
  `);
  const total = Number(readFirstRow<CollectionRecordCountRow>(usage)?.total ?? 0);
  if (total > 0) {
    await executor.execute(sql`
      UPDATE public.collection_staff_nicknames
      SET is_active = false
      WHERE id = ${normalizeCollectionText(id)}::uuid
    `);
    return { deleted: false, deactivated: true };
  }

  await executor.execute(sql`
    DELETE FROM public.admin_visible_nicknames
    WHERE nickname_id = ${normalizeCollectionText(id)}::uuid
  `);
  await executor.execute(sql`
    DELETE FROM public.admin_group_members
    WHERE lower(member_nickname) = lower(${existing.nickname})
  `);
  await executor.execute(sql`
    DELETE FROM public.admin_groups
    WHERE lower(leader_nickname) = lower(${existing.nickname})
  `);
  await executor.execute(sql`
    DELETE FROM public.collection_nickname_sessions
    WHERE lower(nickname) = lower(${existing.nickname})
  `);
  await executor.execute(sql`
    DELETE FROM public.collection_staff_nicknames
    WHERE id = ${normalizeCollectionText(id)}::uuid
  `);
  return { deleted: true, deactivated: false };
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

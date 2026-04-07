import { randomUUID } from "crypto";
import { sql, type SQL } from "drizzle-orm";

import {
  mapCollectionStaffNicknameRow,
  normalizeCollectionNicknameRoleScope,
  type CollectionStaffNicknameDbRow,
} from "./collection-nickname-utils";
import { getCollectionStaffNicknameByIdValue } from "./collection-staff-nickname-lookup-utils";
import {
  normalizeCollectionText,
  readFirstRow,
  type CollectionRecordCountRow,
  type CollectionStaffNicknameExecutor,
} from "./collection-staff-nickname-shared";
import type {
  CollectionStaffNickname,
  CreateCollectionStaffNicknameInput,
  UpdateCollectionStaffNicknameInput,
} from "../storage-postgres";

export function shouldCascadeCollectionNicknameRename(
  previousNickname: unknown,
  nextNickname: unknown,
): boolean {
  const previous = normalizeCollectionText(previousNickname);
  const next = normalizeCollectionText(nextNickname);
  return Boolean(previous && next && previous.toLowerCase() !== next.toLowerCase());
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
  if (shouldCascadeCollectionNicknameRename(existing.nickname, updated.nickname)) {
    const oldNickname = normalizeCollectionText(existing.nickname);
    const newNickname = normalizeCollectionText(updated.nickname);
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

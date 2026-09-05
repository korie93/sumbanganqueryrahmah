import { sql } from "drizzle-orm";
import type { CollectionStaffNicknameExecutor } from "./collection-staff-nickname-shared";

export async function cascadeCollectionNicknameRename(
  executor: CollectionStaffNicknameExecutor,
  nicknameId: string,
  oldNickname: string,
  newNickname: string,
): Promise<void> {
  await executor.execute(sql`
    UPDATE public.admin_groups
    SET
      leader_nickname = ${newNickname},
      updated_at = now()
    WHERE leader_nickname_id = ${nicknameId}::uuid
  `);
  await executor.execute(sql`
    UPDATE public.admin_group_members
    SET member_nickname = ${newNickname}
    WHERE member_nickname_id = ${nicknameId}::uuid
  `);
  await executor.execute(sql`
    UPDATE public.collection_nickname_sessions
    SET
      nickname = ${newNickname},
      updated_at = now()
    WHERE lower(nickname) = lower(${oldNickname})
  `);
}

export async function deleteCollectionStaffNicknameRelations(
  executor: CollectionStaffNicknameExecutor,
  nicknameId: string,
  nickname: string,
): Promise<void> {
  await executor.execute(sql`
    DELETE FROM public.admin_visible_nicknames
    WHERE nickname_id = ${nicknameId}::uuid
  `);
  await executor.execute(sql`
    DELETE FROM public.admin_group_members
    WHERE member_nickname_id = ${nicknameId}::uuid
  `);
  await executor.execute(sql`
    DELETE FROM public.admin_groups
    WHERE leader_nickname_id = ${nicknameId}::uuid
  `);
  await executor.execute(sql`
    DELETE FROM public.collection_nickname_sessions
    WHERE lower(nickname) = lower(${nickname})
  `);
  await executor.execute(sql`
    DELETE FROM public.collection_staff_nicknames
    WHERE id = ${nicknameId}::uuid
  `);
}

import { sql } from "drizzle-orm";

import {
  mapCollectionNicknameSessionRow,
  type CollectionNicknameSessionDbRow,
} from "./collection-nickname-utils";
import {
  normalizeCollectionText,
  readFirstRow,
  type CollectionStaffNicknameExecutor,
} from "./collection-staff-nickname-shared";
import type { CollectionNicknameSession } from "../storage-postgres";

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

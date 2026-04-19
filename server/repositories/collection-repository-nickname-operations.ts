import { sql } from "drizzle-orm";
import { db } from "../db-postgres";
import type {
  CollectionAdminNicknameAccessContext,
  CollectionNicknameAuthProfile,
  CollectionNicknameSession,
  CollectionStaffNickname,
  CreateCollectionStaffNicknameInput,
  UpdateCollectionStaffNicknameInput,
} from "../storage-postgres";
import {
  clearCollectionNicknameSessionValueByActivity,
  createCollectionStaffNicknameValue,
  deleteCollectionStaffNicknameValue,
  getCollectionNicknameAuthProfileByNameValue,
  getCollectionNicknameSessionValueByActivity,
  getCollectionStaffNicknameByIdValue,
  getCollectionStaffNicknameByNameValue,
  isCollectionStaffNicknameActiveValue,
  listCollectionStaffNicknames,
  setCollectionNicknamePasswordValue,
  setCollectionNicknameSessionValue,
  updateCollectionStaffNicknameValue,
} from "./collection-staff-nickname-utils";
import {
  normalizeCollectionText,
  normalizeVisibleNicknameValues,
  readFirstRow,
} from "./collection-admin-group-shared";
import { normalizeCollectionNicknameRoleScope } from "./collection-nickname-utils";

type CollectionAdminNicknameAccessContextRow = {
  nickname?: unknown;
  group_id?: unknown;
  leader_is_active?: unknown;
  leader_role_scope?: unknown;
  member_nicknames?: unknown;
};

function readBooleanColumn(value: unknown): boolean {
  if (value === true || value === 1 || value === "1") {
    return true;
  }
  const normalizedValue = String(value || "").trim().toLowerCase();
  return normalizedValue === "true" || normalizedValue === "t";
}

export async function getCollectionStaffNicknamesRepository(filters?: {
  activeOnly?: boolean;
  allowedRole?: "admin" | "user";
}): Promise<CollectionStaffNickname[]> {
  return listCollectionStaffNicknames(db, filters);
}

export async function setCollectionNicknameSessionRepository(params: {
  activityId: string;
  username: string;
  userRole: string;
  nickname: string;
}): Promise<void> {
  return setCollectionNicknameSessionValue(db, params);
}

export async function getCollectionNicknameSessionByActivityRepository(
  activityId: string,
): Promise<CollectionNicknameSession | undefined> {
  return getCollectionNicknameSessionValueByActivity(db, activityId);
}

export async function getCollectionAdminNicknameAccessContextByActivityRepository(params: {
  activityId: string;
  username: string;
  userRole: string;
}): Promise<CollectionAdminNicknameAccessContext | undefined> {
  const normalizedActivityId = normalizeCollectionText(params.activityId);
  const normalizedUsername = normalizeCollectionText(params.username);
  const normalizedUserRole = normalizeCollectionText(params.userRole);
  if (!normalizedActivityId || !normalizedUsername || !normalizedUserRole) {
    return undefined;
  }

  const result = await db.execute(sql`
    SELECT
      session.nickname,
      admin_group.id AS group_id,
      leader.is_active AS leader_is_active,
      leader.role_scope AS leader_role_scope,
      COALESCE(
        array_agg(DISTINCT group_member.member_nickname) FILTER (WHERE group_member.member_nickname IS NOT NULL),
        ARRAY[]::text[]
      ) AS member_nicknames
    FROM public.collection_nickname_sessions session
    LEFT JOIN public.admin_groups admin_group
      ON lower(admin_group.leader_nickname) = lower(session.nickname)
    LEFT JOIN public.admin_group_members group_member
      ON group_member.admin_group_id = admin_group.id
    LEFT JOIN public.collection_staff_nicknames leader
      ON lower(leader.nickname) = lower(session.nickname)
    WHERE session.activity_id = ${normalizedActivityId}
      AND lower(session.username) = lower(${normalizedUsername})
      AND lower(session.user_role) = lower(${normalizedUserRole})
    GROUP BY
      session.nickname,
      admin_group.id,
      leader.is_active,
      leader.role_scope
    LIMIT 1
  `);

  const row = readFirstRow<CollectionAdminNicknameAccessContextRow>(result);
  const nickname = normalizeCollectionText(row?.nickname);
  if (!nickname) {
    return undefined;
  }

  const hasAdminGroup = Boolean(normalizeCollectionText(row?.group_id));
  const hasOwnProfile =
    row?.leader_role_scope !== undefined
    && row?.leader_role_scope !== null;

  return {
    nickname,
    visibleNicknames: hasAdminGroup
      ? normalizeVisibleNicknameValues(nickname, row?.member_nicknames)
      : [],
    ownProfile: hasOwnProfile
      ? {
        isActive: readBooleanColumn(row?.leader_is_active),
        roleScope: normalizeCollectionNicknameRoleScope(row?.leader_role_scope),
      }
      : null,
  };
}

export async function clearCollectionNicknameSessionByActivityRepository(
  activityId: string,
): Promise<void> {
  return clearCollectionNicknameSessionValueByActivity(db, activityId);
}

export async function getCollectionStaffNicknameByIdRepository(
  id: string,
): Promise<CollectionStaffNickname | undefined> {
  return getCollectionStaffNicknameByIdValue(db, id);
}

export async function getCollectionStaffNicknameByNameRepository(
  nickname: string,
): Promise<CollectionStaffNickname | undefined> {
  return getCollectionStaffNicknameByNameValue(db, nickname);
}

export async function getCollectionNicknameAuthProfileByNameRepository(
  nickname: string,
): Promise<CollectionNicknameAuthProfile | undefined> {
  return getCollectionNicknameAuthProfileByNameValue(db, nickname);
}

export async function setCollectionNicknamePasswordRepository(params: {
  nicknameId: string;
  passwordHash: string;
  mustChangePassword?: boolean;
  passwordResetBySuperuser?: boolean;
  passwordUpdatedAt?: Date | null;
}): Promise<void> {
  return setCollectionNicknamePasswordValue(db, params);
}

export async function createCollectionStaffNicknameRepository(
  data: CreateCollectionStaffNicknameInput,
): Promise<CollectionStaffNickname> {
  return createCollectionStaffNicknameValue(db, data);
}

export async function updateCollectionStaffNicknameRepository(
  id: string,
  data: UpdateCollectionStaffNicknameInput,
): Promise<CollectionStaffNickname | undefined> {
  return db.transaction(async (tx) => {
    return updateCollectionStaffNicknameValue(tx, id, data);
  });
}

export async function deleteCollectionStaffNicknameRepository(
  id: string,
): Promise<{ deleted: boolean; deactivated: boolean }> {
  return deleteCollectionStaffNicknameValue(db, id);
}

export async function isCollectionStaffNicknameActiveRepository(nickname: string): Promise<boolean> {
  return isCollectionStaffNicknameActiveValue(db, nickname);
}

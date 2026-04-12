import {
  normalizeCollectionDate,
  normalizeCollectionNicknameRoleScope,
  normalizeNullableBoolean,
  normalizeNullableText,
} from "./collection-nickname-shared-utils";
import type {
  CollectionAdminGroupDbRow,
  CollectionAdminUserDbRow,
  CollectionNicknameAuthProfileDbRow,
  CollectionNicknameSessionDbRow,
  CollectionStaffNicknameDbRow,
  CollectionMappedAdminGroup,
  CollectionMappedAdminUser,
  CollectionMappedNicknameAuthProfile,
  CollectionMappedNicknameSession,
  CollectionMappedStaffNickname,
} from "./collection-nickname-types";

export function mapCollectionStaffNicknameRow(
  row: CollectionStaffNicknameDbRow,
): CollectionMappedStaffNickname {
  return {
    id: String(row.id ?? ""),
    nickname: String(row.nickname ?? ""),
    isActive: Boolean(row.is_active ?? row.isActive),
    roleScope: normalizeCollectionNicknameRoleScope(row.role_scope ?? row.roleScope),
    createdBy: normalizeNullableText(row.created_by ?? row.createdBy),
    createdAt: normalizeCollectionDate(row.created_at ?? row.createdAt),
  };
}

export function mapCollectionNicknameAuthProfileRow(
  row: CollectionNicknameAuthProfileDbRow,
): CollectionMappedNicknameAuthProfile {
  const passwordUpdatedAtRaw = row.password_updated_at ?? row.passwordUpdatedAt ?? null;
  const passwordUpdatedAt = passwordUpdatedAtRaw === null || passwordUpdatedAtRaw === undefined
    ? null
    : normalizeCollectionDate(passwordUpdatedAtRaw);

  return {
    id: String(row.id ?? ""),
    nickname: String(row.nickname ?? ""),
    isActive: Boolean(row.is_active ?? row.isActive),
    roleScope: normalizeCollectionNicknameRoleScope(row.role_scope ?? row.roleScope),
    mustChangePassword: Boolean(row.must_change_password ?? row.mustChangePassword ?? true),
    passwordResetBySuperuser: Boolean(
      row.password_reset_by_superuser ?? row.passwordResetBySuperuser ?? false,
    ),
    nicknamePasswordHash: normalizeNullableText(row.nickname_password_hash ?? row.nicknamePasswordHash),
    passwordUpdatedAt,
  };
}

export function mapCollectionAdminUserRow(
  row: CollectionAdminUserDbRow,
): CollectionMappedAdminUser {
  return {
    id: String(row.id ?? ""),
    username: String(row.username ?? ""),
    role: "admin",
    isBanned: normalizeNullableBoolean(row.is_banned ?? row.isBanned),
    createdAt: normalizeCollectionDate(row.created_at ?? row.createdAt),
    updatedAt: normalizeCollectionDate(row.updated_at ?? row.updatedAt),
  };
}

export function mapCollectionAdminGroupRow(
  row: CollectionAdminGroupDbRow,
  nicknameIdByLowerName: Map<string, string>,
): CollectionMappedAdminGroup {
  const rawMembers: unknown[] = Array.isArray(row.member_nicknames)
    ? row.member_nicknames
    : Array.isArray(row.memberNicknames)
      ? row.memberNicknames
      : [];

  const memberNicknames = Array.from(
    new Set(
      rawMembers
        .map((value) => String(value ?? "").trim())
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  const memberNicknameIds = memberNicknames
    .map((name) => nicknameIdByLowerName.get(name.toLowerCase()) || "")
    .filter(Boolean);

  return {
    id: String(row.id ?? ""),
    leaderNickname: String(row.leader_nickname ?? row.leaderNickname ?? ""),
    leaderNicknameId: row.leader_nickname_id || row.leaderNicknameId
      ? String(row.leader_nickname_id ?? row.leaderNicknameId)
      : null,
    leaderIsActive: Boolean(row.leader_is_active ?? row.leaderIsActive ?? false),
    leaderRoleScope: row.leader_role_scope
      ? normalizeCollectionNicknameRoleScope(row.leader_role_scope)
      : row.leaderRoleScope
        ? normalizeCollectionNicknameRoleScope(row.leaderRoleScope)
        : null,
    memberNicknames,
    memberNicknameIds,
    createdBy: normalizeNullableText(row.created_by ?? row.createdBy),
    createdAt: normalizeCollectionDate(row.created_at ?? row.createdAt),
    updatedAt: normalizeCollectionDate(row.updated_at ?? row.updatedAt),
  };
}

export function mapCollectionNicknameSessionRow(
  row: CollectionNicknameSessionDbRow,
): CollectionMappedNicknameSession {
  const verifiedAtRaw = row.verified_at ?? row.verifiedAt;
  const updatedAtRaw = row.updated_at ?? row.updatedAt;
  return {
    activityId: String(row.activity_id ?? row.activityId ?? ""),
    username: String(row.username ?? ""),
    userRole: String(row.user_role ?? row.userRole ?? ""),
    nickname: String(row.nickname ?? ""),
    verifiedAt: normalizeCollectionDate(verifiedAtRaw),
    updatedAt: normalizeCollectionDate(updatedAtRaw),
  };
}

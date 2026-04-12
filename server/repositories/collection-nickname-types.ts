import type { SQLWrapper } from "drizzle-orm";
import type {
  CollectionAdminGroup,
  CollectionAdminUser,
  CollectionNicknameAuthProfile,
  CollectionNicknameSession,
  CollectionStaffNickname,
} from "../storage-postgres";

export type CollectionRepositoryQueryResult = {
  rows?: unknown[];
};

export type CollectionRepositoryExecutor = {
  execute: (query: string | SQLWrapper) => Promise<CollectionRepositoryQueryResult>;
};

export type CollectionStaffNicknameDbRow = {
  id?: unknown;
  nickname?: unknown;
  is_active?: unknown;
  isActive?: unknown;
  role_scope?: unknown;
  roleScope?: unknown;
  created_by?: unknown;
  createdBy?: unknown;
  created_at?: unknown;
  createdAt?: unknown;
};

export type CollectionNicknameAuthProfileDbRow = CollectionStaffNicknameDbRow & {
  nickname_password_hash?: unknown;
  nicknamePasswordHash?: unknown;
  must_change_password?: unknown;
  mustChangePassword?: unknown;
  password_reset_by_superuser?: unknown;
  passwordResetBySuperuser?: unknown;
  password_updated_at?: unknown;
  passwordUpdatedAt?: unknown;
};

export type CollectionAdminUserDbRow = {
  id?: unknown;
  username?: unknown;
  is_banned?: unknown;
  isBanned?: unknown;
  created_at?: unknown;
  createdAt?: unknown;
  updated_at?: unknown;
  updatedAt?: unknown;
};

export type CollectionAdminGroupDbRow = {
  id?: unknown;
  leader_nickname?: unknown;
  leaderNickname?: unknown;
  leader_nickname_id?: unknown;
  leaderNicknameId?: unknown;
  leader_is_active?: unknown;
  leaderIsActive?: unknown;
  leader_role_scope?: unknown;
  leaderRoleScope?: unknown;
  member_nicknames?: unknown;
  memberNicknames?: unknown;
  created_by?: unknown;
  createdBy?: unknown;
  created_at?: unknown;
  createdAt?: unknown;
  updated_at?: unknown;
  updatedAt?: unknown;
};

export type CollectionNicknameSessionDbRow = {
  activity_id?: unknown;
  activityId?: unknown;
  username?: unknown;
  user_role?: unknown;
  userRole?: unknown;
  nickname?: unknown;
  verified_at?: unknown;
  verifiedAt?: unknown;
  updated_at?: unknown;
  updatedAt?: unknown;
};

export type CollectionNicknameLookupRow = {
  id?: unknown;
  nickname?: unknown;
  role_scope?: unknown;
  is_active?: unknown;
};

export type CollectionMappedStaffNickname = CollectionStaffNickname;
export type CollectionMappedNicknameAuthProfile = CollectionNicknameAuthProfile;
export type CollectionMappedAdminUser = CollectionAdminUser;
export type CollectionMappedAdminGroup = CollectionAdminGroup;
export type CollectionMappedNicknameSession = CollectionNicknameSession;

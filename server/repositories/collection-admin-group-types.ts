import type {
  CollectionRepositoryExecutor,
} from "./collection-nickname-utils";

export type CollectionNicknameIdRow = {
  id?: unknown;
  nickname?: unknown;
};

export type CollectionExistingAdminGroupRow = {
  id?: unknown;
  leader_nickname?: unknown;
};

export type CollectionAdminGroupMemberRow = {
  member_nickname?: unknown;
};

export type CollectionVisibleNicknameRow = {
  leader_nickname?: unknown;
  member_nicknames?: unknown;
};

export type CollectionAdminGroupExecutor = CollectionRepositoryExecutor;

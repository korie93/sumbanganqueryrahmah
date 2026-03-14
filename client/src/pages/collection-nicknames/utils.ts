import type { CollectionStaffNickname } from "@/lib/api";

export type PendingUngroup = {
  groupId: string;
  nicknameId: string;
};

export const ROLE_SCOPE_OPTIONS: Array<{
  value: "admin" | "user" | "both";
  label: string;
}> = [
  { value: "admin", label: "Admin" },
  { value: "user", label: "User" },
  { value: "both", label: "Admin + User" },
];

export const normalizeCollectionNicknameIds = (ids: string[]) =>
  Array.from(new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b),
  );

export const sameCollectionNicknameIds = (left: string[], right: string[]) => {
  const a = normalizeCollectionNicknameIds(left);
  const b = normalizeCollectionNicknameIds(right);
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
};

export const collectionScopeLabel = (scope: string) =>
  scope === "admin" ? "Admin" : scope === "user" ? "User" : "Admin + User";

export const sortLeaderOptions = (nicknames: CollectionStaffNickname[]) =>
  nicknames
    .filter((nickname) => nickname.isActive && (nickname.roleScope === "admin" || nickname.roleScope === "both"))
    .sort((left, right) => left.nickname.localeCompare(right.nickname, undefined, { sensitivity: "base" }));

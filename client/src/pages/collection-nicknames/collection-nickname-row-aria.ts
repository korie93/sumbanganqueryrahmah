import type { CollectionStaffNickname } from "@/lib/api";
import { collectionScopeLabel } from "@/pages/collection-nicknames/utils";

type NicknameAssignmentRowAriaOptions = {
  isAssigned: boolean;
  isLeader: boolean;
  nickname: CollectionStaffNickname;
};

function normalizeNicknameValue(value: string | null | undefined) {
  const normalized = String(value ?? "-").replace(/\s+/g, " ").trim();
  return normalized || "-";
}

export function buildNicknameAssignmentRowAriaLabel({
  isAssigned,
  isLeader,
  nickname,
}: NicknameAssignmentRowAriaOptions) {
  const details = [
    `Staff nickname ${normalizeNicknameValue(nickname.nickname)}`,
    `scope ${normalizeNicknameValue(collectionScopeLabel(nickname.roleScope))}`,
    `status ${nickname.isActive ? "active" : "inactive"}`,
  ];

  if (isLeader) {
    details.push("group leader");
  } else {
    details.push(isAssigned ? "assigned to selected group" : "not assigned to selected group");
  }

  return details.join(", ");
}

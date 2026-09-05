import type {
  CollectionAdminGroup,
  CollectionStaffNickname,
} from "../../storage-postgres";
import type { CollectionStoragePort } from "./collection-service-support";

export type ActiveCollectionTeam = {
  id: string;
  leaderNickname: string;
  nicknames: string[];
  nicknameIds: string[];
  staffCount: number;
};

export type ActiveCollectionTeamDirectory = {
  teams: ActiveCollectionTeam[];
  activeNicknameKeys: ReadonlySet<string>;
};

export const COLLECTION_TEAM_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeTeamName(value: unknown): string {
  return String(value ?? "").trim();
}

export function buildActiveCollectionTeams(
  groups: readonly CollectionAdminGroup[],
  activeNicknames: readonly CollectionStaffNickname[],
): ActiveCollectionTeam[] {
  const activeNicknameById = new Map<string, CollectionStaffNickname>();
  for (const nickname of activeNicknames) {
    if (!nickname.isActive) continue;
    const id = normalizeTeamName(nickname.id).toLowerCase();
    const name = normalizeTeamName(nickname.nickname);
    if (!id || !name) continue;
    activeNicknameById.set(id, {
      ...nickname,
      id,
      nickname: name,
    });
  }

  return groups.flatMap((group) => {
    const id = normalizeTeamName(group.id).toLowerCase();
    const leaderId = normalizeTeamName(group.leaderNicknameId).toLowerCase();
    const leader = activeNicknameById.get(leaderId);
    if (
      !COLLECTION_TEAM_ID_PATTERN.test(id)
      || !leader
      || !group.leaderIsActive
      || (leader.roleScope !== "admin" && leader.roleScope !== "both")
    ) {
      return [];
    }

    // A leader identifies the persisted team but is not implicitly a team
    // member. Resolve membership by the mapped nickname IDs, then use the
    // current display values. This keeps nickname renames compatible without
    // allowing stale/corrupt nickname text to widen a team scope.
    const teamMembers = new Map<string, { id: string; nickname: string }>();
    for (const rawMemberId of group.memberNicknameIds) {
      const memberId = normalizeTeamName(rawMemberId).toLowerCase();
      if (!memberId || memberId === leaderId) continue;
      const activeMember = activeNicknameById.get(memberId);
      if (!activeMember) continue;
      teamMembers.set(memberId, { id: memberId, nickname: activeMember.nickname });
    }

    const members = Array.from(teamMembers.values()).sort((left, right) => left.nickname.localeCompare(
      right.nickname,
      undefined,
      { sensitivity: "base" },
    ));
    const nicknames = members.map((member) => member.nickname);
    const nicknameIds = members.map((member) => member.id);

    return [{
      id,
      leaderNickname: leader.nickname,
      nicknames,
      nicknameIds,
      staffCount: nicknames.length,
    }];
  }).sort((left, right) => left.leaderNickname.localeCompare(
    right.leaderNickname,
    undefined,
    { sensitivity: "base" },
  ));
}

export async function loadActiveCollectionTeamDirectory(
  storage: Pick<CollectionStoragePort, "getCollectionAdminGroups" | "getCollectionStaffNicknames">,
): Promise<ActiveCollectionTeamDirectory> {
  const [groups, activeNicknames] = await Promise.all([
    storage.getCollectionAdminGroups(),
    storage.getCollectionStaffNicknames({ activeOnly: true }),
  ]);
  return {
    teams: buildActiveCollectionTeams(groups, activeNicknames),
    activeNicknameKeys: new Set(
      activeNicknames
        .filter((nickname) => nickname.isActive)
        .map((nickname) => normalizeTeamName(nickname.nickname).toLowerCase())
        .filter(Boolean),
    ),
  };
}

export async function loadActiveCollectionTeams(
  storage: Pick<CollectionStoragePort, "getCollectionAdminGroups" | "getCollectionStaffNicknames">,
): Promise<ActiveCollectionTeam[]> {
  return (await loadActiveCollectionTeamDirectory(storage)).teams;
}

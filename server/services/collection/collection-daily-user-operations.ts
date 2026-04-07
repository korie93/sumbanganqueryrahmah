import { badRequest, forbidden } from "../../http/errors";
import {
  getAdminVisibleNicknameValues,
  resolveCurrentCollectionNicknameFromSession,
} from "../../routes/collection-access";
import {
  normalizeCollectionStringList,
  normalizeCollectionText,
} from "../../routes/collection.validation";
import type { CollectionStoragePort, ListQuery } from "./collection-service-support";
import type { DailyResolvedUser } from "./collection-daily-overview-shared";

export function parseRequestedDailyUsernames(query: ListQuery): string[] {
  const rawValues: unknown[] = [];
  const appendValues = (raw: unknown) => {
    if (Array.isArray(raw)) {
      for (const value of raw) appendValues(value);
      return;
    }
    const normalized = normalizeCollectionText(raw);
    if (!normalized) return;
    const parts = normalized
      .split(",")
      .map((value) => normalizeCollectionText(value))
      .filter(Boolean);
    rawValues.push(...parts);
  };

  appendValues(query.usernames);
  appendValues(query.username);
  appendValues(query.nicknames);
  appendValues(query.nickname);
  appendValues(query.staff);
  const normalized = normalizeCollectionStringList(rawValues)
    .map((value) => value.toLowerCase());
  return Array.from(new Set(normalized));
}

function normalizeDailyUser(
  id: string | null | undefined,
  username: string | null | undefined,
  role: string | null | undefined,
): DailyResolvedUser | null {
  const normalizedUsername = normalizeCollectionText(username);
  if (!normalizedUsername) return null;
  return {
    id: normalizeCollectionText(id) || normalizedUsername.toLowerCase(),
    username: normalizedUsername,
    role: normalizeCollectionText(role) || "user",
  };
}

export async function listAvailableDailyUsers(
  storage: CollectionStoragePort,
  user: { username: string; role: string },
): Promise<DailyResolvedUser[]> {
  if (user.role === "user") {
    const currentNickname = await resolveCurrentCollectionNicknameFromSession(storage, user);
    if (!currentNickname) {
      return [];
    }
    const nicknameProfile = await storage.getCollectionStaffNicknameByName(currentNickname);
    const resolved = normalizeDailyUser(
      nicknameProfile?.id,
      nicknameProfile?.nickname || currentNickname,
      nicknameProfile?.roleScope || user.role,
    );
    return resolved ? [resolved] : [];
  }

  if (user.role === "admin") {
    const visibleNicknames = await getAdminVisibleNicknameValues(storage, user);
    if (visibleNicknames.length === 0) {
      return [];
    }
    const nicknameProfiles = await storage.getCollectionStaffNicknames();
    const profileByLower = new Map(
      nicknameProfiles.map((item) => [item.nickname.toLowerCase(), item]),
    );
    return visibleNicknames
      .map((nickname) => {
        const matched = profileByLower.get(nickname.toLowerCase());
        return normalizeDailyUser(
          matched?.id,
          matched?.nickname || nickname,
          matched?.roleScope || "user",
        );
      })
      .filter((item): item is DailyResolvedUser => Boolean(item));
  }

  const nicknameProfiles = await storage.getCollectionStaffNicknames();
  return nicknameProfiles
    .map((item) => normalizeDailyUser(item.id, item.nickname, item.roleScope))
    .filter((item): item is DailyResolvedUser => Boolean(item));
}

export function resolveDailySelectedUsers(
  user: { username: string; role: string },
  requestedUsernames: string[],
  availableUsers: DailyResolvedUser[],
  preferredUsername?: string | null,
): DailyResolvedUser[] {
  const userMap = new Map<string, DailyResolvedUser>(
    availableUsers.map((item) => [
      item.username.toLowerCase(),
      item,
    ]),
  );
  if (user.role === "user") {
    const ownUsername = normalizeCollectionText(preferredUsername).toLowerCase();
    if (!ownUsername) {
      throw badRequest("Current staff nickname session could not be resolved.");
    }
    if (requestedUsernames.length > 0 && requestedUsernames.some((value) => value !== ownUsername)) {
      throw forbidden("User hanya boleh melihat data sendiri.");
    }
    const ownUser = userMap.get(ownUsername);
    if (!ownUser) {
      throw badRequest("Staff nickname not found.");
    }
    return [ownUser];
  }

  const preferredUsernameLower = normalizeCollectionText(preferredUsername).toLowerCase();
  const targetUsernames = requestedUsernames.length > 0
    ? requestedUsernames
    : (preferredUsernameLower && userMap.has(preferredUsernameLower)
        ? [preferredUsernameLower]
        : availableUsers.length > 0
          ? [availableUsers[0].username.toLowerCase()]
          : []);

  const selectedUsers: DailyResolvedUser[] = [];
  for (const username of targetUsernames) {
    const matched = userMap.get(username.toLowerCase());
    if (!matched) {
      throw badRequest(`Invalid staff nickname filter: ${username}`);
    }
    selectedUsers.push(matched);
  }

  if (selectedUsers.length === 0) {
    throw badRequest("No staff nicknames selected.");
  }

  return selectedUsers;
}

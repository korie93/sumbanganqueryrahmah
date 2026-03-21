import type { AuthenticatedUser } from "../auth/guards";
import type { CollectionNicknameAuthProfile } from "../storage-postgres";
import type { CollectionStoragePort } from "../services/collection/collection-service-support";
import {
  COLLECTION_STAFF_NICKNAME_MIN_LENGTH,
  isNicknameScopeAllowedForRole,
  normalizeCollectionStringList,
  normalizeCollectionText,
} from "./collection.validation";

export type CollectionNicknameAccessResolution =
  | { ok: true; profile: CollectionNicknameAuthProfile }
  | { ok: false; status: number; message: string };

export async function resolveCurrentCollectionNicknameFromSession(
  storage: CollectionStoragePort,
  user: AuthenticatedUser,
): Promise<string | null> {
  const activityId = normalizeCollectionText(user.activityId);
  if (!activityId) return null;

  const session = await storage.getCollectionNicknameSessionByActivity(activityId);
  if (!session) return null;
  if (normalizeCollectionText(session.username).toLowerCase() !== normalizeCollectionText(user.username).toLowerCase()) {
    return null;
  }
  if (normalizeCollectionText(session.userRole).toLowerCase() !== normalizeCollectionText(user.role).toLowerCase()) {
    return null;
  }
  const nickname = normalizeCollectionText(session.nickname);
  return nickname || null;
}

export async function getAdminGroupNicknameValues(
  storage: CollectionStoragePort,
  user: AuthenticatedUser,
): Promise<string[]> {
  const currentNickname = await resolveCurrentCollectionNicknameFromSession(storage, user);
  if (!currentNickname) return [];

  const visibleFromGroup = await storage.getCollectionAdminGroupVisibleNicknameValuesByLeader(currentNickname);
  const normalized = normalizeCollectionStringList(visibleFromGroup);
  if (normalized.length > 0) {
    const leaderLower = currentNickname.toLowerCase();
    const own = normalized.filter((value) => value.toLowerCase() === leaderLower);
    const others = normalized
      .filter((value) => value.toLowerCase() !== leaderLower)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    return [...own, ...others];
  }

  const ownProfile = await storage.getCollectionStaffNicknameByName(currentNickname);
  if (ownProfile && ownProfile.isActive && isNicknameScopeAllowedForRole(ownProfile.roleScope, user.role)) {
    return [ownProfile.nickname];
  }
  return [];
}

export async function getAdminVisibleNicknameValues(
  storage: CollectionStoragePort,
  user: AuthenticatedUser,
): Promise<string[]> {
  return getAdminGroupNicknameValues(storage, user);
}

export function hasNicknameValue(values: string[], target: string): boolean {
  const normalizedTarget = normalizeCollectionText(target).toLowerCase();
  if (!normalizedTarget) return false;
  return values.some((value) => value.toLowerCase() === normalizedTarget);
}

export async function canUserAccessCollectionRecord(
  storage: CollectionStoragePort,
  user: AuthenticatedUser,
  record: {
    createdByLogin?: string | null;
    collectionStaffNickname?: string | null;
  },
): Promise<boolean> {
  if (user.role === "superuser") return true;

  if (user.role === "user") {
    const currentNickname = await resolveCurrentCollectionNicknameFromSession(storage, user);
    if (currentNickname) {
      return hasNicknameValue([currentNickname], normalizeCollectionText(record.collectionStaffNickname));
    }

    const owner = normalizeCollectionText(record.createdByLogin).toLowerCase();
    const current = normalizeCollectionText(user.username).toLowerCase();
    return Boolean(owner) && owner === current;
  }

  if (user.role === "admin") {
    const allowedNicknames = await getAdminVisibleNicknameValues(storage, user);
    return hasNicknameValue(allowedNicknames, normalizeCollectionText(record.collectionStaffNickname));
  }

  return false;
}

export function readNicknameFiltersFromQuery(query: Record<string, unknown>): string[] {
  const candidates: string[] = [];
  const pushValue = (raw: unknown) => {
    if (Array.isArray(raw)) {
      for (const item of raw) pushValue(item);
      return;
    }
    const normalized = normalizeCollectionText(raw);
    if (!normalized) return;
    const parts = normalized
      .split(",")
      .map((part) => normalizeCollectionText(part))
      .filter(Boolean);
    candidates.push(...parts);
  };

  pushValue(query.nickname);
  pushValue(query.staff);
  pushValue(query.nicknames);
  return normalizeCollectionStringList(candidates);
}

export async function resolveCollectionNicknameAccessForUser(
  storage: CollectionStoragePort,
  user: AuthenticatedUser,
  nicknameRaw: unknown,
): Promise<CollectionNicknameAccessResolution> {
  const nickname = normalizeCollectionText(nicknameRaw);
  if (nickname.length < COLLECTION_STAFF_NICKNAME_MIN_LENGTH) {
    return {
      ok: false,
      status: 400,
      message: "Staff nickname mesti sekurang-kurangnya 2 aksara.",
    };
  }

  const profile = await storage.getCollectionNicknameAuthProfileByName(nickname);
  if (!profile || !profile.isActive) {
    return {
      ok: false,
      status: 400,
      message: "Staff nickname tidak sah atau sudah inactive.",
    };
  }

  if (!isNicknameScopeAllowedForRole(profile.roleScope, user.role)) {
    return {
      ok: false,
      status: 403,
      message: "Staff nickname tidak dibenarkan untuk role semasa.",
    };
  }

  return { ok: true, profile };
}

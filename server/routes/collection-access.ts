import type { AuthenticatedUser } from "../auth/guards";
import type { AuthenticatedRequest } from "../auth/guards";
import type { NextFunction, RequestHandler, Response } from "express";
import type { CollectionNicknameAuthProfile } from "../storage-postgres";
import type { CollectionStoragePort } from "../services/collection/collection-service-support";
import { forbidden, notFound } from "../http/errors";
import { readRouteParam } from "../http/validation";
import {
  COLLECTION_STAFF_NICKNAME_MIN_LENGTH,
  isNicknameScopeAllowedForRole,
  normalizeCollectionStringList,
  normalizeCollectionText,
} from "./collection.validation";

export type CollectionNicknameAccessResolution =
  | { ok: true; profile: CollectionNicknameAuthProfile }
  | { ok: false; status: number; message: string };

export type CollectionAccessUser = Pick<AuthenticatedUser, "role" | "username"> & {
  activityId?: string | null;
};

export type ExistingCollectionAccessRecord = NonNullable<
  Awaited<ReturnType<CollectionStoragePort["getCollectionRecordById"]>>
>;

function isCollectionAccessUserSnapshotUsable(user: CollectionAccessUser): boolean {
  const status = normalizeCollectionText("status" in user ? user.status : undefined).toLowerCase();
  if (status && status !== "active") {
    return false;
  }

  if ("isBanned" in user && user.isBanned === true) {
    return false;
  }

  const sessionExpiresAt = normalizeCollectionText(
    "sessionExpiresAt" in user ? user.sessionExpiresAt : undefined,
  );
  if (sessionExpiresAt) {
    const expiryMs = Date.parse(sessionExpiresAt);
    if (!Number.isFinite(expiryMs) || expiryMs <= Date.now()) {
      return false;
    }
  }

  if ("exp" in user && typeof user.exp === "number") {
    if (!Number.isFinite(user.exp) || user.exp * 1000 <= Date.now()) {
      return false;
    }
  }

  return true;
}

export async function resolveCurrentCollectionNicknameFromSession(
  storage: CollectionStoragePort,
  user: CollectionAccessUser,
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
  user: CollectionAccessUser,
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
  user: CollectionAccessUser,
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
  user: CollectionAccessUser,
  record: {
    createdByLogin?: string | null;
    collectionStaffNickname?: string | null;
  },
): Promise<boolean> {
  if (!isCollectionAccessUserSnapshotUsable(user)) {
    return false;
  }

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

export async function getAccessibleCollectionRecordOrThrow(
  storage: CollectionStoragePort,
  user: AuthenticatedUser,
  id: string,
): Promise<ExistingCollectionAccessRecord> {
  const existing = await storage.getCollectionRecordById(id);
  if (!existing) {
    throw notFound("Collection record not found.");
  }
  if (!(await canUserAccessCollectionRecord(storage, user, existing))) {
    throw forbidden("Forbidden");
  }
  return existing;
}

type RequireCollectionRecordAccessOptions = {
  storage: CollectionStoragePort;
  resolveRecordId?: ((req: AuthenticatedRequest) => string) | undefined;
};

export type CollectionRecordAccessRequestAuthorizer = (req: Parameters<RequestHandler>[0]) => Promise<void>;

export function createAuthorizeCollectionRecordAccess(
  options: RequireCollectionRecordAccessOptions,
): CollectionRecordAccessRequestAuthorizer {
  return async (req): Promise<void> => {
    const authenticatedReq = req as AuthenticatedRequest;
    if (!authenticatedReq.user) {
      throw forbidden("Forbidden");
    }

    const recordId = options.resolveRecordId
      ? options.resolveRecordId(authenticatedReq)
      : readRouteParam(authenticatedReq.params.id, "collection record id");
    await getAccessibleCollectionRecordOrThrow(options.storage, authenticatedReq.user, recordId);
  };
}

export function createRequireCollectionRecordAccess(
  options: RequireCollectionRecordAccessOptions,
): RequestHandler {
  const authorize = createAuthorizeCollectionRecordAccess(options);
  return async (req, _res: Response, next: NextFunction): Promise<void> => {
    try {
      await authorize(req as AuthenticatedRequest);
      next();
    } catch (error) {
      next(error);
    }
  };
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
  user: CollectionAccessUser,
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

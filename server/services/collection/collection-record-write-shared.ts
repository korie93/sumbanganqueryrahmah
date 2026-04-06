import { badRequest, conflict, forbidden, notFound } from "../../http/errors";
import type { AuthenticatedUser } from "../../auth/guards";
import {
  canUserAccessCollectionRecord,
  getAdminVisibleNicknameValues,
  hasNicknameValue,
} from "../../routes/collection-access";
import {
  isNicknameScopeAllowedForRole,
  normalizeCollectionText,
} from "../../routes/collection.validation";
import type { CollectionStoragePort } from "./collection-service-support";
import {
  COLLECTION_RECORD_VERSION_CONFLICT_MESSAGE,
  resolveRecordVersionTimestamp,
} from "./collection-record-runtime-utils";
import { logCollectionRecordVersionConflict } from "./collection-record-mutation-support";

export type RequireUserFn = (user?: AuthenticatedUser) => AuthenticatedUser;

export type ExistingCollectionRecord = NonNullable<
  Awaited<ReturnType<CollectionStoragePort["getCollectionRecordById"]>>
>;

export function requireCollectionRecordId(idRaw: unknown): string {
  const id = normalizeCollectionText(idRaw);
  if (!id) {
    throw badRequest("Collection id is required.");
  }
  return id;
}

export async function getAccessibleCollectionRecordOrThrow(
  storage: CollectionStoragePort,
  user: AuthenticatedUser,
  id: string,
): Promise<ExistingCollectionRecord> {
  const existing = await storage.getCollectionRecordById(id);
  if (!existing) {
    throw notFound("Collection record not found.");
  }
  if (!(await canUserAccessCollectionRecord(storage, user, existing))) {
    throw forbidden("Forbidden");
  }
  return existing;
}

export async function assertCollectionStaffNicknameWriteAccess(
  storage: CollectionStoragePort,
  user: AuthenticatedUser,
  nickname: string,
): Promise<void> {
  const staffNickname = await storage.getCollectionStaffNicknameByName(nickname);
  if (!staffNickname?.isActive) {
    throw badRequest("Staff nickname tidak sah atau sudah inactive.");
  }
  if (user.role === "admin") {
    const allowedNicknames = await getAdminVisibleNicknameValues(storage, user);
    if (!hasNicknameValue(allowedNicknames, nickname)) {
      throw forbidden("Nickname tidak dibenarkan untuk akaun admin ini.");
    }
    return;
  }
  if (!isNicknameScopeAllowedForRole(staffNickname.roleScope, user.role)) {
    throw forbidden("Nickname ini tidak dibenarkan untuk role semasa.");
  }
}

export async function assertCollectionRecordVersionMatch(params: {
  storage: CollectionStoragePort;
  user: AuthenticatedUser;
  recordId: string;
  operation: "update" | "delete";
  existing: ExistingCollectionRecord;
  expectedUpdatedAt: Date | null;
}): Promise<void> {
  if (!params.expectedUpdatedAt) {
    return;
  }

  const currentVersion = resolveRecordVersionTimestamp(params.existing);
  if (!currentVersion || currentVersion.getTime() !== params.expectedUpdatedAt.getTime()) {
    await logCollectionRecordVersionConflict(params.storage, {
      username: params.user.username,
      recordId: params.recordId,
      operation: params.operation,
      expectedUpdatedAt: params.expectedUpdatedAt,
      currentUpdatedAt: currentVersion,
    });
    throw conflict(COLLECTION_RECORD_VERSION_CONFLICT_MESSAGE, "COLLECTION_RECORD_VERSION_CONFLICT");
  }
}

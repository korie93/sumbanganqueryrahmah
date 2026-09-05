import { badRequest, conflict, forbidden } from "../../http/errors";
import type { AuthenticatedUser } from "../../auth/guards";
import {
  getAdminVisibleNicknameValues,
  getAccessibleCollectionRecordOrThrow,
  hasNicknameValue,
  resolveVerifiedCollectionNicknameFromSession,
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

export { getAccessibleCollectionRecordOrThrow };

export function requireCollectionRecordId(idRaw: unknown): string {
  const id = normalizeCollectionText(idRaw);
  if (!id) {
    throw badRequest("Collection id is required.");
  }
  return id;
}

export async function assertCollectionStaffNicknameWriteAccess(
  storage: CollectionStoragePort,
  user: AuthenticatedUser,
  nickname: string,
): Promise<string> {
  if (user.role === "user") {
    return requireCollectionStaffNicknameCreateAccess(storage, user, nickname);
  }
  const staffNickname = await storage.getCollectionStaffNicknameByName(nickname);
  if (!staffNickname?.isActive) {
    throw badRequest("Staff nickname tidak sah atau sudah inactive.");
  }
  if (user.role === "admin") {
    if (!(await resolveVerifiedCollectionNicknameFromSession(storage, user))) {
      throw forbidden(
        "Sesi nickname belum disahkan atau sudah tamat. Sila sahkan nickname semula sebelum simpan collection.",
        "COLLECTION_NICKNAME_SESSION_REQUIRED",
      );
    }
    const allowedNicknames = await getAdminVisibleNicknameValues(storage, user);
    if (!hasNicknameValue(allowedNicknames, nickname)) {
      throw forbidden("Nickname tidak dibenarkan untuk akaun admin ini.");
    }
    return staffNickname.nickname;
  }
  if (!isNicknameScopeAllowedForRole(staffNickname.roleScope, user.role)) {
    throw forbidden("Nickname ini tidak dibenarkan untuk role semasa.");
  }
  return staffNickname.nickname;
}

export async function requireCollectionStaffNicknameCreateAccess(
  storage: CollectionStoragePort,
  user: AuthenticatedUser,
  nickname: string,
): Promise<string> {
  if (user.role === "superuser") {
    const profile = await storage.getCollectionStaffNicknameByName(nickname);
    if (!profile?.isActive) {
      throw badRequest("Staff nickname tidak sah atau sudah inactive.");
    }
    return profile.nickname;
  }
  if (user.role !== "admin" && user.role !== "user") throw forbidden();
  const verified = await resolveVerifiedCollectionNicknameFromSession(storage, user);
  if (!verified) {
    throw forbidden(
      "Sesi nickname belum disahkan atau sudah tamat. Sila sahkan nickname semula sebelum simpan collection.",
      "COLLECTION_NICKNAME_SESSION_REQUIRED",
    );
  }
  if (!hasNicknameValue([verified.nickname], nickname)) {
    throw forbidden(
      "Nickname collection tidak sepadan dengan nickname yang disahkan. Sila sahkan nickname semula.",
      "COLLECTION_NICKNAME_SESSION_MISMATCH",
    );
  }
  return verified.nickname;
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

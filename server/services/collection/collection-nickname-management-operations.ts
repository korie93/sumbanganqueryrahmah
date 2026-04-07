import type { AuthenticatedUser } from "../../auth/guards";
import type { CollectionStaffNickname } from "../../storage-postgres";
import { badRequest, conflict, notFound } from "../../http/errors";
import { getAdminGroupNicknameValues } from "../../routes/collection-access";
import {
  COLLECTION_STAFF_NICKNAME_MIN_LENGTH,
  ensureLooseObject,
  normalizeCollectionNicknameRoleScope,
  normalizeCollectionText,
  type CollectionNicknamePayload,
} from "../../routes/collection.validation";
import { CollectionServiceSupport } from "./collection-service-support";

export class CollectionNicknameManagementOperations extends CollectionServiceSupport {
  async listNicknames(
    userInput: AuthenticatedUser | undefined,
    includeInactiveRaw: unknown,
  ) {
    const user = this.requireUser(userInput);
    const includeInactive = normalizeCollectionText(includeInactiveRaw) === "1";

    let nicknames: CollectionStaffNickname[];
    if (user.role === "superuser") {
      nicknames = await this.storage.getCollectionStaffNicknames({ activeOnly: !includeInactive });
    } else if (user.role === "admin") {
      const allowedValues = await getAdminGroupNicknameValues(this.storage, user);
      if (allowedValues.length === 0) {
        nicknames = [];
      } else {
        const activeNicknames = await this.storage.getCollectionStaffNicknames({ activeOnly: true });
        const byName = new Map<string, CollectionStaffNickname>();
        for (const item of activeNicknames) {
          const key = normalizeCollectionText(item.nickname).toLowerCase();
          if (key && !byName.has(key)) byName.set(key, item);
        }
        nicknames = allowedValues
          .map((value) => byName.get(value.toLowerCase()))
          .filter((item): item is CollectionStaffNickname => Boolean(item));
      }
    } else {
      nicknames = await this.storage.getCollectionStaffNicknames({
        activeOnly: true,
        allowedRole: "user",
      });
    }

    return { ok: true as const, nicknames };
  }

  async createNickname(
    userInput: AuthenticatedUser | undefined,
    bodyRaw: unknown,
  ) {
    const user = this.requireUser(userInput);
    const body = (ensureLooseObject(bodyRaw) || {}) as CollectionNicknamePayload;
    const nickname = normalizeCollectionText(body.nickname);
    const roleScope = normalizeCollectionNicknameRoleScope(body.roleScope, "both");
    if (nickname.length < COLLECTION_STAFF_NICKNAME_MIN_LENGTH) {
      throw badRequest("Nickname mesti sekurang-kurangnya 2 aksara.");
    }

    const existing = await this.storage.getCollectionStaffNicknameByName(nickname);
    if (existing) {
      throw conflict("Nickname already exists.");
    }

    try {
      const created = await this.storage.createCollectionStaffNickname({
        nickname,
        createdBy: user.username,
        roleScope,
      });

      await this.storage.createAuditLog({
        action: "COLLECTION_NICKNAME_CREATED",
        performedBy: user.username,
        targetResource: created.id,
        details: `Collection nickname created: ${created.nickname} (scope=${created.roleScope})`,
      });

      return { ok: true as const, nickname: created };
    } catch (err) {
      const rawMessage = String((err as { message?: string })?.message || "").toLowerCase();
      if (rawMessage.includes("duplicate")) {
        throw conflict("Nickname already exists.");
      }
      throw err;
    }
  }

  async updateNickname(
    userInput: AuthenticatedUser | undefined,
    idRaw: unknown,
    bodyRaw: unknown,
  ) {
    const user = this.requireUser(userInput);
    const id = normalizeCollectionText(idRaw);
    const body = (ensureLooseObject(bodyRaw) || {}) as CollectionNicknamePayload;
    const nickname = normalizeCollectionText(body.nickname);
    const roleScopeProvided = Object.prototype.hasOwnProperty.call(body, "roleScope");
    const roleScope = normalizeCollectionNicknameRoleScope(body.roleScope, "both");

    if (!id) {
      throw badRequest("Nickname id is required.");
    }
    if (nickname.length < COLLECTION_STAFF_NICKNAME_MIN_LENGTH) {
      throw badRequest("Nickname mesti sekurang-kurangnya 2 aksara.");
    }

    const existingByName = await this.storage.getCollectionStaffNicknameByName(nickname);
    if (existingByName && existingByName.id !== id) {
      throw conflict("Nickname already exists.");
    }

    try {
      const updated = await this.storage.updateCollectionStaffNickname(id, {
        nickname,
        ...(roleScopeProvided ? { roleScope } : {}),
      });
      if (!updated) {
        throw notFound("Nickname not found.");
      }

      await this.storage.createAuditLog({
        action: "COLLECTION_NICKNAME_UPDATED",
        performedBy: user.username,
        targetResource: updated.id,
        details: `Collection nickname updated to ${updated.nickname} (scope=${updated.roleScope})`,
      });

      return { ok: true as const, nickname: updated };
    } catch (err) {
      const rawMessage = String((err as { message?: string })?.message || "").toLowerCase();
      if (rawMessage.includes("duplicate")) {
        throw conflict("Nickname already exists.");
      }
      throw err;
    }
  }

  async updateNicknameStatus(
    userInput: AuthenticatedUser | undefined,
    idRaw: unknown,
    bodyRaw: unknown,
  ) {
    const user = this.requireUser(userInput);
    const id = normalizeCollectionText(idRaw);
    if (!id) {
      throw badRequest("Nickname id is required.");
    }

    const body = (ensureLooseObject(bodyRaw) || {}) as CollectionNicknamePayload;
    if (!Object.prototype.hasOwnProperty.call(body, "isActive")) {
      throw badRequest("isActive is required.");
    }
    const isActive = Boolean(body.isActive);
    const updated = await this.storage.updateCollectionStaffNickname(id, { isActive });
    if (!updated) {
      throw notFound("Nickname not found.");
    }

    await this.storage.createAuditLog({
      action: "COLLECTION_NICKNAME_STATUS_UPDATED",
      performedBy: user.username,
      targetResource: updated.id,
      details: `Collection nickname ${updated.nickname} set active=${updated.isActive}`,
    });

    return { ok: true as const, nickname: updated };
  }

  async deleteNickname(
    userInput: AuthenticatedUser | undefined,
    idRaw: unknown,
  ) {
    const user = this.requireUser(userInput);
    const id = normalizeCollectionText(idRaw);
    if (!id) {
      throw badRequest("Nickname id is required.");
    }

    const result = await this.storage.deleteCollectionStaffNickname(id);
    if (!result.deleted && !result.deactivated) {
      throw notFound("Nickname not found.");
    }

    await this.storage.createAuditLog({
      action: result.deleted ? "COLLECTION_NICKNAME_DELETED" : "COLLECTION_NICKNAME_DEACTIVATED",
      performedBy: user.username,
      targetResource: id,
      details: result.deleted ? "Collection nickname deleted." : "Collection nickname deactivated due to existing usage.",
    });

    return { ok: true as const, ...result };
  }
}

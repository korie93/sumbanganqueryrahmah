import bcrypt from "bcrypt";
import {
  CREDENTIAL_BCRYPT_COST,
  CREDENTIAL_PASSWORD_MIN_LENGTH,
  isStrongPassword,
} from "../../auth/credentials";
import { badRequest, conflict, notFound, unauthorized } from "../../http/errors";
import {
  getAdminGroupNicknameValues,
} from "../../routes/collection-access";
import {
  COLLECTION_NICKNAME_TEMP_PASSWORD,
  COLLECTION_STAFF_NICKNAME_MIN_LENGTH,
  ensureLooseObject,
  normalizeCollectionNicknameRoleScope,
  normalizeCollectionText,
  type CollectionNicknameAuthPayload,
  type CollectionNicknamePayload,
} from "../../routes/collection.validation";
import { CollectionServiceSupport } from "./collection-service-support";

export class CollectionNicknameService extends CollectionServiceSupport {
  async listNicknames(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], includeInactiveRaw: unknown) {
    const user = this.requireUser(userInput);
    const includeInactive = normalizeCollectionText(includeInactiveRaw) === "1";

    let nicknames;
    if (user.role === "superuser") {
      nicknames = await this.storage.getCollectionStaffNicknames({ activeOnly: !includeInactive });
    } else if (user.role === "admin") {
      const allowedValues = await getAdminGroupNicknameValues(this.storage, user);
      if (allowedValues.length === 0) {
        nicknames = [];
      } else {
        const activeNicknames = await this.storage.getCollectionStaffNicknames({ activeOnly: true });
        const byName = new Map<string, any>();
        for (const item of activeNicknames) {
          const key = normalizeCollectionText(item.nickname).toLowerCase();
          if (key && !byName.has(key)) byName.set(key, item);
        }
        nicknames = allowedValues
          .map((value) => byName.get(value.toLowerCase()))
          .filter(Boolean);
      }
    } else {
      nicknames = await this.storage.getCollectionStaffNicknames({
        activeOnly: true,
        allowedRole: "user",
      });
    }

    return { ok: true as const, nicknames };
  }

  async checkNicknameAuth(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], bodyRaw: unknown) {
    const user = this.requireUser(userInput);
    const body = (ensureLooseObject(bodyRaw) || {}) as CollectionNicknameAuthPayload;
    const profile = await this.requireNicknameAccess(user, body.nickname);

    const hasPassword = Boolean(normalizeCollectionText(profile.nicknamePasswordHash));
    const mustChangePassword = Boolean(profile.mustChangePassword || !hasPassword);
    const passwordResetBySuperuser = Boolean(profile.passwordResetBySuperuser);
    const requiresPasswordSetup = !hasPassword;
    const requiresPasswordLogin = hasPassword;
    const requiresForcedPasswordChange = hasPassword && (mustChangePassword || passwordResetBySuperuser);

    return {
      ok: true as const,
      nickname: {
        id: profile.id,
        nickname: profile.nickname,
        mustChangePassword,
        passwordResetBySuperuser,
        requiresPasswordSetup,
        requiresPasswordLogin,
        requiresForcedPasswordChange,
      },
    };
  }

  async setupNicknamePassword(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], bodyRaw: unknown) {
    const user = this.requireUser(userInput);
    const body = (ensureLooseObject(bodyRaw) || {}) as CollectionNicknameAuthPayload;
    const profile = await this.requireNicknameAccess(user, body.nickname);

    const currentPassword = String(body.currentPassword || "");
    const newPassword = String(body.newPassword || "");
    const confirmPassword = String(body.confirmPassword || "");
    if (!newPassword || !confirmPassword) {
      throw badRequest("New password dan confirm password diperlukan.");
    }
    if (newPassword !== confirmPassword) {
      throw badRequest("Password dan confirm password tidak sepadan.");
    }
    if (!isStrongPassword(newPassword)) {
      throw badRequest(
        `Password mesti sekurang-kurangnya ${CREDENTIAL_PASSWORD_MIN_LENGTH} aksara dan mengandungi huruf serta nombor.`,
      );
    }

    const existingHash = normalizeCollectionText(profile.nicknamePasswordHash);
    const hasExistingPassword = Boolean(existingHash);
    if (hasExistingPassword) {
      if (!currentPassword) {
        throw badRequest("Current password diperlukan untuk tukar password nickname.");
      }
      const validCurrentPassword = await bcrypt.compare(currentPassword, existingHash);
      if (!validCurrentPassword) {
        throw unauthorized("Current password nickname tidak sah.");
      }
      const sameAsCurrent = await bcrypt.compare(newPassword, existingHash);
      if (sameAsCurrent) {
        throw badRequest("Password baharu mesti berbeza daripada password semasa.");
      }
    }

    const passwordHash = await bcrypt.hash(newPassword, CREDENTIAL_BCRYPT_COST);
    await this.storage.setCollectionNicknamePassword({
      nicknameId: profile.id,
      passwordHash,
      mustChangePassword: false,
      passwordResetBySuperuser: false,
      passwordUpdatedAt: new Date(),
    });

    await this.storage.createAuditLog({
      action: "COLLECTION_NICKNAME_PASSWORD_SET",
      performedBy: user.username,
      targetResource: profile.id,
      details: `Nickname password set for ${profile.nickname}`,
    });

    if (user.activityId) {
      await this.storage.setCollectionNicknameSession({
        activityId: user.activityId,
        username: user.username,
        userRole: user.role,
        nickname: profile.nickname,
      });
    }

    return {
      ok: true as const,
      nickname: {
        id: profile.id,
        nickname: profile.nickname,
        mustChangePassword: false,
        passwordResetBySuperuser: false,
      },
    };
  }

  async loginNickname(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], bodyRaw: unknown) {
    const user = this.requireUser(userInput);
    const body = (ensureLooseObject(bodyRaw) || {}) as CollectionNicknameAuthPayload;
    const profile = await this.requireNicknameAccess(user, body.nickname);

    const password = String(body.password || "");
    if (!password) {
      throw badRequest("Password diperlukan.");
    }

    const hash = normalizeCollectionText(profile.nicknamePasswordHash);
    if (!hash) {
      throw badRequest("Sila tetapkan kata laluan baharu untuk nickname ini sebelum meneruskan.");
    }

    const valid = await bcrypt.compare(password, hash);
    if (!valid) {
      throw unauthorized("Password nickname tidak sah.");
    }

    const requiresForcedPasswordChange = Boolean(profile.mustChangePassword) || Boolean(profile.passwordResetBySuperuser);
    if (requiresForcedPasswordChange) {
      return {
        ok: true as const,
        nickname: {
          id: profile.id,
          nickname: profile.nickname,
          mustChangePassword: true,
          passwordResetBySuperuser: Boolean(profile.passwordResetBySuperuser),
          requiresForcedPasswordChange: true,
        },
      };
    }

    if (user.activityId) {
      await this.storage.setCollectionNicknameSession({
        activityId: user.activityId,
        username: user.username,
        userRole: user.role,
        nickname: profile.nickname,
      });
    }

    return {
      ok: true as const,
      nickname: {
        id: profile.id,
        nickname: profile.nickname,
        mustChangePassword: false,
        passwordResetBySuperuser: false,
        requiresForcedPasswordChange: false,
      },
    };
  }

  async createNickname(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], bodyRaw: unknown) {
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

  async updateNickname(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], idRaw: unknown, bodyRaw: unknown) {
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

  async updateNicknameStatus(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], idRaw: unknown, bodyRaw: unknown) {
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

  async resetNicknamePassword(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], idRaw: unknown) {
    const user = this.requireUser(userInput);
    const id = normalizeCollectionText(idRaw);
    if (!id) {
      throw badRequest("Nickname id is required.");
    }

    const nickname = await this.storage.getCollectionStaffNicknameById(id);
    if (!nickname) {
      throw notFound("Nickname not found.");
    }

    const passwordHash = await bcrypt.hash(COLLECTION_NICKNAME_TEMP_PASSWORD, CREDENTIAL_BCRYPT_COST);
    await this.storage.setCollectionNicknamePassword({
      nicknameId: nickname.id,
      passwordHash,
      mustChangePassword: true,
      passwordResetBySuperuser: true,
      passwordUpdatedAt: new Date(),
    });

    await this.storage.createAuditLog({
      action: "COLLECTION_NICKNAME_PASSWORD_RESET",
      performedBy: user.username,
      targetResource: nickname.id,
      details: `Password nickname reset by superuser for ${nickname.nickname}`,
    });

    return {
      ok: true as const,
      temporaryPassword: COLLECTION_NICKNAME_TEMP_PASSWORD,
      nickname: {
        id: nickname.id,
        nickname: nickname.nickname,
        mustChangePassword: true,
        passwordResetBySuperuser: true,
      },
    };
  }

  async deleteNickname(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], idRaw: unknown) {
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

import bcrypt from "bcrypt";
import {
  CREDENTIAL_BCRYPT_COST,
  isStrongPassword,
} from "../../auth/credentials";
import type { AuthenticatedUser } from "../../auth/guards";
import { badRequest, notFound, unauthorized } from "../../http/errors";
import { PASSWORD_POLICY_ERROR_MESSAGE_MS } from "../../../shared/password-policy";
import {
  COLLECTION_NICKNAME_TEMP_PASSWORD,
  ensureLooseObject,
  normalizeCollectionText,
  type CollectionNicknameAuthPayload,
} from "../../routes/collection.validation";
import { CollectionServiceSupport } from "./collection-service-support";

export class CollectionNicknameAuthOperations extends CollectionServiceSupport {
  async checkNicknameAuth(
    userInput: AuthenticatedUser | undefined,
    bodyRaw: unknown,
  ) {
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

  async setupNicknamePassword(
    userInput: AuthenticatedUser | undefined,
    bodyRaw: unknown,
  ) {
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
      throw badRequest(PASSWORD_POLICY_ERROR_MESSAGE_MS);
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

  async loginNickname(
    userInput: AuthenticatedUser | undefined,
    bodyRaw: unknown,
  ) {
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

  async resetNicknamePassword(
    userInput: AuthenticatedUser | undefined,
    idRaw: unknown,
  ) {
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
}

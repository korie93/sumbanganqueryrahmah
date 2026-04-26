import {
  buildTwoFactorOtpAuthUrl,
  decryptTwoFactorSecret,
  encryptTwoFactorSecret,
  generateTwoFactorSecret,
  verifyTwoFactorCode,
} from "../auth/two-factor";
import { consumeTwoFactorReplayCode } from "../auth/two-factor-replay-cache";
import { verifyPassword } from "../auth/passwords";
import type { PostgresStorage } from "../storage-postgres";
import { ERROR_CODES } from "../../shared/error-codes";
import { AuthAccountError } from "./auth-account-types";

export type StartTwoFactorSetupInput = {
  currentPassword: string;
};

export type ConfirmTwoFactorSetupInput = {
  code: string;
};

export type DisableTwoFactorInput = {
  currentPassword: string;
  code: string;
};

type AuthAccountUser = NonNullable<Awaited<ReturnType<PostgresStorage["getUser"]>>>;

type AuthAccountSelfTwoFactorStorage = Pick<PostgresStorage, "createAuditLog" | "updateUserAccount">;

type AuthAccountSelfTwoFactorDeps = {
  storage: AuthAccountSelfTwoFactorStorage;
};

export class AuthAccountSelfTwoFactorOperations {
  constructor(private readonly deps: AuthAccountSelfTwoFactorDeps) {}

  private requireTwoFactorEligibleRole(actor: AuthAccountUser) {
    if (actor.role !== "admin" && actor.role !== "superuser") {
      throw new AuthAccountError(
        403,
        ERROR_CODES.TWO_FACTOR_NOT_ALLOWED,
        "Two-factor authentication is only available for admin and superuser accounts.",
      );
    }
  }

  private async requireCurrentPassword(actor: AuthAccountUser, currentPasswordRaw: string) {
    const currentPassword = String(currentPasswordRaw || "");
    if (!currentPassword) {
      throw new AuthAccountError(400, ERROR_CODES.INVALID_CURRENT_PASSWORD, "Current password is required.");
    }

    const valid = await verifyPassword(currentPassword, actor.passwordHash);
    if (!valid) {
      throw new AuthAccountError(400, ERROR_CODES.INVALID_CURRENT_PASSWORD, "Current password is invalid.");
    }
  }

  async startTwoFactorSetup(actor: AuthAccountUser, input: StartTwoFactorSetupInput) {
    this.requireTwoFactorEligibleRole(actor);
    await this.requireCurrentPassword(actor, input.currentPassword);

    const secret = generateTwoFactorSecret();
    let encryptedSecret = "";
    try {
      encryptedSecret = encryptTwoFactorSecret(secret);
    } catch {
      throw new AuthAccountError(
        503,
        ERROR_CODES.TWO_FACTOR_SECRET_INVALID,
        "Two-factor authentication setup is unavailable. Contact an administrator.",
      );
    }
    const updatedUser = await this.deps.storage.updateUserAccount({
      userId: actor.id,
      twoFactorEnabled: false,
      twoFactorSecretEncrypted: encryptedSecret,
      twoFactorConfiguredAt: null,
    });

    await this.deps.storage.createAuditLog({
      action: "TWO_FACTOR_SETUP_INITIATED",
      performedBy: actor.id,
      targetUser: actor.id,
      details: JSON.stringify({
        metadata: {
          role: actor.role,
        },
      }),
    });

    return {
      user: updatedUser ?? actor,
      setup: {
        accountName: actor.username,
        issuer: "SQR",
        otpauthUrl: buildTwoFactorOtpAuthUrl({
          issuer: "SQR",
          username: actor.username,
          secret,
        }),
        secret,
      },
    };
  }

  async confirmTwoFactorSetup(actor: AuthAccountUser, input: ConfirmTwoFactorSetupInput) {
    this.requireTwoFactorEligibleRole(actor);

    const encryptedSecret = String(actor.twoFactorSecretEncrypted || "").trim();
    if (!encryptedSecret) {
      throw new AuthAccountError(
        409,
        ERROR_CODES.TWO_FACTOR_SETUP_MISSING,
        "Start two-factor setup before verifying an authenticator code.",
      );
    }

    let secret = "";
    try {
      secret = decryptTwoFactorSecret(encryptedSecret);
    } catch {
      throw new AuthAccountError(
        500,
        ERROR_CODES.TWO_FACTOR_SECRET_INVALID,
        "Two-factor authentication is unavailable. Start setup again.",
      );
    }

    if (!verifyTwoFactorCode(secret, input.code)) {
      throw new AuthAccountError(400, ERROR_CODES.TWO_FACTOR_INVALID_CODE, "Authenticator code is invalid.");
    }

    if (!consumeTwoFactorReplayCode({ code: input.code, purpose: "setup", subjectId: actor.id })) {
      throw new AuthAccountError(400, ERROR_CODES.TWO_FACTOR_INVALID_CODE, "Authenticator code is invalid.");
    }

    const now = new Date();
    const updatedUser = await this.deps.storage.updateUserAccount({
      userId: actor.id,
      twoFactorEnabled: true,
      twoFactorConfiguredAt: now,
    });

    await this.deps.storage.createAuditLog({
      action: "TWO_FACTOR_ENABLED",
      performedBy: actor.id,
      targetUser: actor.id,
      details: JSON.stringify({
        metadata: {
          enabled_at: now.toISOString(),
          role: actor.role,
        },
      }),
    });

    return updatedUser ?? actor;
  }

  async disableTwoFactor(actor: AuthAccountUser, input: DisableTwoFactorInput) {
    this.requireTwoFactorEligibleRole(actor);
    await this.requireCurrentPassword(actor, input.currentPassword);

    const encryptedSecret = String(actor.twoFactorSecretEncrypted || "").trim();
    if (!actor.twoFactorEnabled || !encryptedSecret) {
      throw new AuthAccountError(
        409,
        ERROR_CODES.TWO_FACTOR_NOT_ENABLED,
        "Two-factor authentication is not enabled.",
      );
    }

    let secret = "";
    try {
      secret = decryptTwoFactorSecret(encryptedSecret);
    } catch {
      throw new AuthAccountError(
        500,
        ERROR_CODES.TWO_FACTOR_SECRET_INVALID,
        "Two-factor authentication is unavailable.",
      );
    }

    if (!verifyTwoFactorCode(secret, input.code)) {
      throw new AuthAccountError(400, ERROR_CODES.TWO_FACTOR_INVALID_CODE, "Authenticator code is invalid.");
    }

    if (!consumeTwoFactorReplayCode({ code: input.code, purpose: "disable", subjectId: actor.id })) {
      throw new AuthAccountError(400, ERROR_CODES.TWO_FACTOR_INVALID_CODE, "Authenticator code is invalid.");
    }

    const updatedUser = await this.deps.storage.updateUserAccount({
      userId: actor.id,
      twoFactorEnabled: false,
      twoFactorSecretEncrypted: null,
      twoFactorConfiguredAt: null,
    });

    await this.deps.storage.createAuditLog({
      action: "TWO_FACTOR_DISABLED",
      performedBy: actor.id,
      targetUser: actor.id,
      details: JSON.stringify({
        metadata: {
          role: actor.role,
        },
      }),
    });

    return updatedUser ?? actor;
  }
}

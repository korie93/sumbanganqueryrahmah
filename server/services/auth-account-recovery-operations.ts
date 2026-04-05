import {
  CREDENTIAL_EMAIL_REGEX,
  normalizeUsernameInput,
} from "../auth/credentials";
import {
  isManageableUserRole,
  normalizeAccountStatus,
} from "../auth/account-lifecycle";
import {
  hashOpaqueToken,
  hashPassword,
} from "../auth/passwords";
import type { PostgresStorage } from "../storage-postgres";
import {
  assertConfirmedStrongPassword,
  assertUsableActivationTokenRecord,
  assertUsablePasswordResetTokenRecord,
} from "./auth-account-token-utils";
import {
  sendActivationEmailOperation,
  sendPasswordResetEmailOperation,
} from "./auth-account-authentication-utils";
import {
  type ActivationTokenValidationResult,
  type ManagedAccountActivationDelivery,
  type ManagedAccountPasswordResetDelivery,
  type PasswordResetTokenValidationResult,
  AuthAccountError,
} from "./auth-account-types";

type AuthAccountRecoveryStorage = Pick<
  PostgresStorage,
  | "consumeActivationTokenById"
  | "consumePasswordResetRequestById"
  | "createActivationToken"
  | "createAuditLog"
  | "createPasswordResetRequest"
  | "getActivationTokenRecordByHash"
  | "getPasswordResetTokenRecordByHash"
  | "getUser"
  | "getUserByEmail"
  | "getUserByUsername"
  | "invalidateUnusedActivationTokens"
  | "invalidateUnusedPasswordResetTokens"
  | "updateUserAccount"
>;

type AuthAccountRecoveryDeps = {
  storage: AuthAccountRecoveryStorage;
  invalidateUserSessions: (username: string, reason: string) => Promise<string[]>;
  requireManagedEmail: (email: string | null, message: string) => string;
};

export class AuthAccountRecoveryOperations {
  constructor(private readonly deps: AuthAccountRecoveryDeps) {}

  async sendActivationEmail(params: {
    actorUsername: string;
    user: Awaited<ReturnType<PostgresStorage["getUser"]>>;
    resent?: boolean;
  }) {
    if (!params.user) {
      throw new AuthAccountError(404, "USER_NOT_FOUND", "Target user not found.");
    }

    if (normalizeAccountStatus(params.user.status, "pending_activation") !== "pending_activation") {
      throw new AuthAccountError(
        409,
        "ACCOUNT_UNAVAILABLE",
        "Activation can only be sent to pending accounts.",
      );
    }

    if (params.user.isBanned) {
      throw new AuthAccountError(
        409,
        "ACCOUNT_UNAVAILABLE",
        "Activation can only be sent to non-banned accounts.",
      );
    }

    return sendActivationEmailOperation({
      actorUsername: params.actorUsername,
      requireManagedEmail: this.deps.requireManagedEmail,
      resent: params.resent,
      storage: this.deps.storage,
      user: params.user,
    });
  }

  async sendPasswordResetEmail(params: {
    expiresAt: Date;
    resetUrl: string;
    user: Awaited<ReturnType<PostgresStorage["getUser"]>>;
  }): Promise<ManagedAccountPasswordResetDelivery> {
    return sendPasswordResetEmailOperation({
      expiresAt: params.expiresAt,
      requireManagedEmail: this.deps.requireManagedEmail,
      resetUrl: params.resetUrl,
      user: params.user,
    });
  }

  async validateActivationToken(rawTokenInput: string): Promise<ActivationTokenValidationResult> {
    const rawToken = String(rawTokenInput || "").trim();
    if (!rawToken) {
      throw new AuthAccountError(400, "INVALID_TOKEN", "Activation token is invalid.");
    }

    const tokenHash = hashOpaqueToken(rawToken);
    const now = new Date();
    const record = assertUsableActivationTokenRecord(
      await this.deps.storage.getActivationTokenRecordByHash(tokenHash),
      now,
    );

    return {
      email: record.email,
      expiresAt: record.expiresAt,
      fullName: record.fullName,
      role: record.role,
      username: record.username,
    };
  }

  async activateAccount(params: {
    username?: string;
    token: string;
    newPassword: string;
    confirmPassword: string;
  }) {
    const rawToken = String(params.token || "").trim();
    const newPassword = String(params.newPassword || "");
    const confirmPassword = String(params.confirmPassword || "");

    if (!rawToken) {
      throw new AuthAccountError(400, "INVALID_TOKEN", "Activation token is invalid.");
    }

    assertConfirmedStrongPassword(newPassword, confirmPassword);

    const tokenHash = hashOpaqueToken(rawToken);
    const now = new Date();
    const record = assertUsableActivationTokenRecord(
      await this.deps.storage.getActivationTokenRecordByHash(tokenHash),
      now,
    );
    const requestedUsername = normalizeUsernameInput(params.username);
    if (requestedUsername && requestedUsername !== record.username) {
      throw new AuthAccountError(400, "INVALID_TOKEN", "Activation token is invalid.");
    }

    const consumed = await this.deps.storage.consumeActivationTokenById({
      tokenId: record.tokenId,
      now,
    });
    if (!consumed) {
      const latest = await this.deps.storage.getActivationTokenRecordByHash(tokenHash);
      assertUsableActivationTokenRecord(latest, now);
      throw new AuthAccountError(400, "INVALID_TOKEN", "Activation token is invalid.");
    }

    const target = await this.deps.storage.getUser(record.userId);
    if (!target) {
      throw new AuthAccountError(404, "USER_NOT_FOUND", "Target user not found.");
    }
    if (
      target.isBanned
      || normalizeAccountStatus(target.status, "pending_activation") !== "pending_activation"
    ) {
      throw new AuthAccountError(
        409,
        "ACCOUNT_UNAVAILABLE",
        "Account activation is no longer available.",
      );
    }

    const passwordHash = await hashPassword(newPassword);
    const updatedUser = await this.deps.storage.updateUserAccount({
      userId: target.id,
      passwordHash,
      passwordChangedAt: now,
      activatedAt: now,
      status: "active",
      mustChangePassword: false,
      passwordResetBySuperuser: false,
      failedLoginAttempts: 0,
      lockedAt: null,
      lockedReason: null,
      lockedBySystem: false,
    });

    await this.deps.storage.invalidateUnusedActivationTokens(target.id);
    await this.deps.storage.createAuditLog({
      action: "ACCOUNT_ACTIVATION_COMPLETED",
      performedBy: target.username,
      targetUser: target.id,
      details: "Account activation completed.",
    });

    return updatedUser ?? target;
  }

  async requestPasswordReset(identifier: string) {
    const normalized = String(identifier || "").trim().toLowerCase();
    if (!normalized) {
      throw new AuthAccountError(400, "INVALID_IDENTIFIER", "Username or email is required.");
    }

    const user = CREDENTIAL_EMAIL_REGEX.test(normalized)
      ? await this.deps.storage.getUserByEmail(normalized)
      : await this.deps.storage.getUserByUsername(normalized) || await this.deps.storage.getUserByEmail(normalized);

    if (!user || user.role === "superuser") {
      return { accepted: true };
    }

    await this.deps.storage.createPasswordResetRequest({
      userId: user.id,
      requestedByUser: normalized,
    });

    await this.deps.storage.createAuditLog({
      action: "PASSWORD_RESET_REQUESTED",
      performedBy: user.username,
      targetUser: user.id,
      details: "Password reset request submitted.",
    });

    return { accepted: true };
  }

  async validatePasswordResetToken(
    rawTokenInput: string,
  ): Promise<PasswordResetTokenValidationResult> {
    const rawToken = String(rawTokenInput || "").trim();
    if (!rawToken) {
      throw new AuthAccountError(400, "INVALID_TOKEN", "Password reset token is invalid.");
    }

    const tokenHash = hashOpaqueToken(rawToken);
    const now = new Date();
    const record = assertUsablePasswordResetTokenRecord(
      await this.deps.storage.getPasswordResetTokenRecordByHash(tokenHash),
      now,
    );

    return {
      email: record.email,
      expiresAt: record.expiresAt,
      fullName: record.fullName,
      role: record.role,
      username: record.username,
    };
  }

  async resetPasswordWithToken(params: {
    token: string;
    newPassword: string;
    confirmPassword: string;
  }) {
    const rawToken = String(params.token || "").trim();
    const newPassword = String(params.newPassword || "");
    const confirmPassword = String(params.confirmPassword || "");

    if (!rawToken) {
      throw new AuthAccountError(400, "INVALID_TOKEN", "Password reset token is invalid.");
    }

    assertConfirmedStrongPassword(newPassword, confirmPassword);

    const tokenHash = hashOpaqueToken(rawToken);
    const now = new Date();
    const record = assertUsablePasswordResetTokenRecord(
      await this.deps.storage.getPasswordResetTokenRecordByHash(tokenHash),
      now,
    );
    const consumed = await this.deps.storage.consumePasswordResetRequestById({
      requestId: record.requestId,
      now,
    });

    if (!consumed) {
      const latest = await this.deps.storage.getPasswordResetTokenRecordByHash(tokenHash);
      assertUsablePasswordResetTokenRecord(latest, now);
      throw new AuthAccountError(400, "INVALID_TOKEN", "Password reset token is invalid.");
    }

    const target = await this.deps.storage.getUser(record.userId);
    if (!target) {
      throw new AuthAccountError(404, "USER_NOT_FOUND", "Target user not found.");
    }

    if (!isManageableUserRole(target.role)) {
      throw new AuthAccountError(
        409,
        "ACCOUNT_UNAVAILABLE",
        "Password reset is not available for this account.",
      );
    }

    if (normalizeAccountStatus(target.status, "active") === "pending_activation") {
      throw new AuthAccountError(
        409,
        "ACCOUNT_UNAVAILABLE",
        "Pending accounts must complete activation before password reset.",
      );
    }

    const passwordHash = await hashPassword(newPassword);
    const updatedUser = await this.deps.storage.updateUserAccount({
      userId: target.id,
      passwordHash,
      passwordChangedAt: now,
      mustChangePassword: false,
      passwordResetBySuperuser: false,
      activatedAt: target.activatedAt ?? now,
      failedLoginAttempts: 0,
      lockedAt: null,
      lockedReason: null,
      lockedBySystem: false,
    });

    await this.deps.storage.invalidateUnusedPasswordResetTokens(target.id, now);
    await this.deps.invalidateUserSessions(target.username, "PASSWORD_RESET_COMPLETED");
    await this.deps.storage.createAuditLog({
      action: "PASSWORD_RESET_COMPLETED",
      performedBy: target.username,
      targetUser: target.id,
      details: JSON.stringify({
        metadata: {
          reset_type: "email_link",
          lock_cleared: Boolean(target.lockedAt),
        },
      }),
    });

    return updatedUser ?? target;
  }
}

import {
  CREDENTIAL_EMAIL_REGEX,
  normalizeUsernameInput,
} from "../auth/credentials";
import {
  getAccountAccessBlockReason,
  isManageableUserRole,
  normalizeAccountStatus,
} from "../auth/account-lifecycle";
import {
  hashOpaqueToken,
  hashPassword,
  verifyPassword,
} from "../auth/passwords";
import type { PostgresStorage } from "../storage-postgres";
import { ERROR_CODES } from "../../shared/error-codes";
import {
  assertConfirmedStrongPassword,
  assertUsableActivationTokenRecord,
  assertUsablePasswordResetTokenRecord,
} from "./auth-account-token-utils";
import {
  type AuthAccountAuthenticationStorage,
  clearFailedLoginState,
  createAuthenticatedSession,
  failLockedLogin,
  handleFailedPasswordAttempt,
  invalidateUserSessions,
  requiresTwoFactor,
  sendActivationEmailOperation,
  sendPasswordResetEmailOperation,
  verifyTwoFactorSecretCode,
} from "./auth-account-authentication-utils";
import {
  type ActivationTokenValidationResult,
  type ManagedAccountActivationDelivery,
  type ManagedAccountPasswordResetDelivery,
  type PasswordResetTokenValidationResult,
  AuthAccountError,
} from "./auth-account-types";

type LoginInput = {
  username: string;
  password: string;
  fingerprint?: string | null;
  browserName: string;
  pcName?: string | null;
  ipAddress?: string | null;
};

type TwoFactorLoginInput = {
  userId: string;
  code: string;
  fingerprint?: string | null;
  browserName: string;
  pcName?: string | null;
  ipAddress?: string | null;
};

type AuthAccountAuthenticationDeps = {
  storage: AuthAccountAuthenticationStorage;
  requireManagedEmail: (email: string | null, message: string) => string;
};

export class AuthAccountAuthenticationOperations {
  private static readonly MAX_ALLOWED_FAILED_PASSWORD_ATTEMPTS = 3;
  private static readonly LOCKED_ACCOUNT_REASON = "too_many_failed_password_attempts";
  private static readonly LOCKED_ACCOUNT_MESSAGE =
    "Your account has been locked due to too many incorrect login attempts. Please contact the system administrator.";

  constructor(private readonly deps: AuthAccountAuthenticationDeps) {}

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

  async invalidateUserSessions(username: string, reason: string) {
    return invalidateUserSessions(this.deps.storage, username, reason);
  }

  async login(input: LoginInput) {
    const username = normalizeUsernameInput(input.username);
    const password = String(input.password ?? "");
    const user = await this.deps.storage.getUserByUsername(username);

    if (!user) {
      await this.deps.storage.createAuditLog({
        action: "LOGIN_FAILED",
        performedBy: username || "unknown",
        details: "User not found",
      });
      throw new AuthAccountError(401, ERROR_CODES.INVALID_CREDENTIALS, "Invalid credentials");
    }

    const visitorBanned = await this.deps.storage.isVisitorBanned(
      input.fingerprint ?? null,
      input.ipAddress ?? null,
      user.username,
    );

    if (visitorBanned || user.isBanned) {
      await this.deps.storage.createAuditLog({
        action: "LOGIN_FAILED_BANNED",
        performedBy: user.username,
        details: visitorBanned ? "Visitor is banned" : "User is banned",
      });
      throw new AuthAccountError(403, "ACCOUNT_BANNED", "Account is banned", {
        banned: true,
      });
    }

    const blockReason = getAccountAccessBlockReason(user);
    if (blockReason && blockReason !== "banned") {
      if (blockReason === "locked") {
        await failLockedLogin(this.deps.storage, user, {
          action: "LOGIN_BLOCKED_LOCKED_ACCOUNT",
          details: "Login blocked because the account is locked after repeated failed password attempts.",
          lockedAccountMessage: AuthAccountAuthenticationOperations.LOCKED_ACCOUNT_MESSAGE,
        });
      }

      await this.deps.storage.createAuditLog({
        action: "LOGIN_FAILED_ACCOUNT_STATE",
        performedBy: user.username,
        targetUser: user.id,
        details: `Login blocked due to account state: ${blockReason}`,
      });
      throw new AuthAccountError(401, ERROR_CODES.INVALID_CREDENTIALS, "Invalid credentials");
    }

    const validPassword = await verifyPassword(password, user.passwordHash);
    if (!validPassword) {
      await handleFailedPasswordAttempt({
        input: {
        fingerprint: input.fingerprint,
        browserName: input.browserName,
        pcName: input.pcName,
        ipAddress: input.ipAddress,
        },
        lockedAccountMessage: AuthAccountAuthenticationOperations.LOCKED_ACCOUNT_MESSAGE,
        lockedReason: AuthAccountAuthenticationOperations.LOCKED_ACCOUNT_REASON,
        maxAllowedAttempts: AuthAccountAuthenticationOperations.MAX_ALLOWED_FAILED_PASSWORD_ATTEMPTS,
        storage: this.deps.storage,
        user,
      });
    }

    const unlockedUser = await clearFailedLoginState(this.deps.storage, user);

    if (requiresTwoFactor(unlockedUser)) {
      await this.deps.storage.createAuditLog({
        action: "LOGIN_SECOND_FACTOR_REQUIRED",
        performedBy: unlockedUser.username,
        targetUser: unlockedUser.id,
        details: `Second factor required from ${input.browserName}`,
      });

      return {
        kind: "two_factor_required" as const,
        user: unlockedUser,
      };
    }

    const sessionResult = await createAuthenticatedSession({
      details: `Login from ${input.browserName}`,
      input,
      storage: this.deps.storage,
      user: unlockedUser,
    });

    return {
      kind: "authenticated" as const,
      user: unlockedUser,
      activity: sessionResult.activity,
      closedSessionIds: sessionResult.closedSessionIds,
    };
  }

  async verifyTwoFactorLogin(input: TwoFactorLoginInput) {
    const user = await this.deps.storage.getUser(input.userId);
    if (!user) {
      throw new AuthAccountError(404, "USER_NOT_FOUND", "User not found.");
    }

    const visitorBanned = await this.deps.storage.isVisitorBanned(
      input.fingerprint ?? null,
      input.ipAddress ?? null,
      user.username,
    );

    if (visitorBanned || user.isBanned) {
      await this.deps.storage.createAuditLog({
        action: "LOGIN_2FA_FAILED_BANNED",
        performedBy: user.username,
        targetUser: user.id,
        details: visitorBanned ? "Visitor is banned" : "User is banned",
      });
      throw new AuthAccountError(403, "ACCOUNT_BANNED", "Account is banned", {
        banned: true,
      });
    }

    const blockReason = getAccountAccessBlockReason(user);
    if (blockReason && blockReason !== "banned") {
      if (blockReason === "locked") {
        await failLockedLogin(this.deps.storage, user, {
          action: "LOGIN_2FA_BLOCKED_LOCKED_ACCOUNT",
          details: "Second-factor login blocked because the account is locked after repeated failed password attempts.",
          lockedAccountMessage: AuthAccountAuthenticationOperations.LOCKED_ACCOUNT_MESSAGE,
        });
      }

      await this.deps.storage.createAuditLog({
        action: "LOGIN_2FA_FAILED_ACCOUNT_STATE",
        performedBy: user.username,
        targetUser: user.id,
        details: `Second-factor login blocked due to account state: ${blockReason}`,
      });
      throw new AuthAccountError(401, ERROR_CODES.INVALID_CREDENTIALS, "Invalid credentials");
    }

    if (!requiresTwoFactor(user)) {
      throw new AuthAccountError(409, ERROR_CODES.TWO_FACTOR_NOT_ENABLED, "Two-factor authentication is not enabled.");
    }

    const encryptedSecret = String(user.twoFactorSecretEncrypted || "").trim();
    try {
      verifyTwoFactorSecretCode({
        code: input.code,
        encryptedSecret,
      });
    } catch (error) {
      if (
        error instanceof AuthAccountError
        && error.code === ERROR_CODES.TWO_FACTOR_SECRET_INVALID
      ) {
        await this.deps.storage.createAuditLog({
          action: "LOGIN_2FA_FAILED_SECRET",
          performedBy: user.username,
          targetUser: user.id,
          details: "Stored two-factor secret could not be decrypted.",
        });
        throw error;
      }
      await this.deps.storage.createAuditLog({
        action: "LOGIN_2FA_FAILED",
        performedBy: user.username,
        targetUser: user.id,
        details: `Invalid authenticator code from ${input.browserName}`,
      });
      throw error;
    }

    const sessionResult = await createAuthenticatedSession({
      details: `Login with 2FA from ${input.browserName}`,
      input: {
        fingerprint: input.fingerprint,
        browserName: input.browserName,
        pcName: input.pcName,
        ipAddress: input.ipAddress,
      },
      storage: this.deps.storage,
      user,
    });

    return {
      user,
      activity: sessionResult.activity,
      closedSessionIds: sessionResult.closedSessionIds,
    };
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
    await this.invalidateUserSessions(target.username, "PASSWORD_RESET_COMPLETED");
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

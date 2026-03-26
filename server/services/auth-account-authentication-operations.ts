import { buildActivationUrl } from "../auth/activation-links";
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
import {
  decryptTwoFactorSecret,
  verifyTwoFactorCode,
} from "../auth/two-factor";
import { buildAccountActivationEmail } from "../mail/account-activation-email";
import { buildPasswordResetEmail } from "../mail/password-reset-email";
import { sendMail } from "../mail/mailer";
import type { PostgresStorage } from "../storage-postgres";
import { ERROR_CODES } from "../../shared/error-codes";
import {
  assertConfirmedStrongPassword,
  assertUsableActivationTokenRecord,
  assertUsablePasswordResetTokenRecord,
  createActivationTokenPayload,
} from "./auth-account-token-utils";
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

type AuthAccountAuthenticationStorage = Pick<
  PostgresStorage,
  | "consumeActivationTokenById"
  | "consumePasswordResetRequestById"
  | "createActivationToken"
  | "createActivity"
  | "createAuditLog"
  | "createPasswordResetRequest"
  | "deactivateUserActivities"
  | "deactivateUserSessionsByFingerprint"
  | "getActivationTokenRecordByHash"
  | "getActiveActivitiesByUsername"
  | "getBooleanSystemSetting"
  | "getPasswordResetTokenRecordByHash"
  | "getUser"
  | "getUserByEmail"
  | "getUserByUsername"
  | "invalidateUnusedActivationTokens"
  | "invalidateUnusedPasswordResetTokens"
  | "isVisitorBanned"
  | "recordFailedLoginAttempt"
  | "touchLastLogin"
  | "updateUserAccount"
> & {
  getAppConfig?: () => Promise<{ sessionTimeoutMinutes?: unknown } | null | undefined>;
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

  private requiresTwoFactor(user: Awaited<ReturnType<PostgresStorage["getUser"]>>) {
    return (
      (user?.role === "superuser" || user?.role === "admin")
      && user?.twoFactorEnabled === true
      && Boolean(String(user?.twoFactorSecretEncrypted || "").trim())
    );
  }

  private async getSuperuserSessionIdleWindowMs(): Promise<number> {
    const fallbackMinutes = 30;
    try {
      const runtime = await this.deps.storage.getAppConfig?.();
      const configuredMinutes = Number(runtime?.sessionTimeoutMinutes);
      const safeMinutes = Number.isFinite(configuredMinutes)
        ? Math.min(1440, Math.max(1, Math.floor(configuredMinutes)))
        : fallbackMinutes;
      return safeMinutes * 60 * 1000;
    } catch {
      return fallbackMinutes * 60 * 1000;
    }
  }

  private isRecentActivitySession(
    activity: { lastActivityTime?: Date | string | null; loginTime?: Date | string | null },
    nowMs: number,
    idleWindowMs: number,
  ): boolean {
    const timestampSource = activity.lastActivityTime ?? activity.loginTime ?? null;
    if (!timestampSource) {
      return true;
    }
    const activityMs = new Date(timestampSource).getTime();
    if (!Number.isFinite(activityMs)) {
      return true;
    }
    return nowMs - activityMs <= idleWindowMs;
  }

  private async issueActivationToken(params: {
    userId: string;
    createdBy: string;
  }) {
    const activation = createActivationTokenPayload();

    await this.deps.storage.invalidateUnusedActivationTokens(params.userId);
    await this.deps.storage.createActivationToken({
      userId: params.userId,
      tokenHash: activation.tokenHash,
      expiresAt: activation.expiresAt,
      createdBy: params.createdBy,
    });

    return activation;
  }

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

    const recipientEmail = this.deps.requireManagedEmail(
      params.user.email,
      "Email is required to send account activation.",
    );
    const activation = await this.issueActivationToken({
      userId: params.user.id,
      createdBy: params.actorUsername,
    });
    const activationUrl = buildActivationUrl(activation.token);
    const email = buildAccountActivationEmail({
      activationUrl,
      expiresAt: activation.expiresAt,
      username: params.user.username,
    });
    const mailResult = await sendMail({
      to: recipientEmail,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });

    await this.deps.storage.createAuditLog({
      action: mailResult.sent ? "ACCOUNT_ACTIVATION_SENT" : "ACCOUNT_ACTIVATION_SEND_FAILED",
      performedBy: params.actorUsername,
      targetUser: params.user.id,
      details: JSON.stringify({
        metadata: {
          delivery: "email",
          delivery_mode: mailResult.deliveryMode,
          resent: params.resent === true,
          expires_at: activation.expiresAt.toISOString(),
          recipient_email: recipientEmail,
          mail_error_code: mailResult.errorCode,
        },
      }),
    });

    return {
      activation,
      delivery: {
        deliveryMode: mailResult.deliveryMode,
        errorCode: mailResult.errorCode,
        errorMessage: mailResult.errorMessage,
        expiresAt: activation.expiresAt,
        previewUrl: mailResult.previewUrl,
        recipientEmail,
        sent: mailResult.sent,
      } satisfies ManagedAccountActivationDelivery,
    };
  }

  async sendPasswordResetEmail(params: {
    expiresAt: Date;
    resetUrl: string;
    user: Awaited<ReturnType<PostgresStorage["getUser"]>>;
  }): Promise<ManagedAccountPasswordResetDelivery> {
    if (!params.user) {
      throw new AuthAccountError(404, "USER_NOT_FOUND", "Target user not found.");
    }

    const recipientEmail = this.deps.requireManagedEmail(
      params.user.email,
      "Email is required to send password reset.",
    );
    const email = buildPasswordResetEmail({
      resetUrl: params.resetUrl,
      expiresAt: params.expiresAt,
      username: params.user.username,
    });
    const mailResult = await sendMail({
      to: recipientEmail,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });

    return {
      deliveryMode: mailResult.deliveryMode,
      errorCode: mailResult.errorCode,
      errorMessage: mailResult.errorMessage,
      expiresAt: params.expiresAt,
      previewUrl: mailResult.previewUrl,
      recipientEmail,
      sent: mailResult.sent,
    };
  }

  async invalidateUserSessions(username: string, reason: string) {
    const activeSessions = await this.deps.storage.getActiveActivitiesByUsername(username);
    await this.deps.storage.deactivateUserActivities(username, reason);
    return activeSessions.map((activity) => activity.id);
  }

  private async createAuthenticatedSession(
    user: NonNullable<Awaited<ReturnType<PostgresStorage["getUser"]>>>,
    input: Omit<LoginInput, "password" | "username">,
    details: string,
  ) {
    if (user.role === "superuser") {
      const enforceSingleSession = await this.deps.storage.getBooleanSystemSetting(
        "enforce_superuser_single_session",
        false,
      );

      if (enforceSingleSession) {
        const activeSessions = await this.deps.storage.getActiveActivitiesByUsername(user.username);
        if (activeSessions.length > 0) {
          const nowMs = Date.now();
          const idleWindowMs = await this.getSuperuserSessionIdleWindowMs();
          const freshSessions = activeSessions.filter((session) =>
            this.isRecentActivitySession(session, nowMs, idleWindowMs),
          );

          if (freshSessions.length === 0) {
            await this.deps.storage.deactivateUserActivities(user.username, "IDLE_TIMEOUT");
            await this.deps.storage.createAuditLog({
              action: "LOGIN_STALE_SESSION_RECOVERED",
              performedBy: user.username,
              targetUser: user.id,
              details: `Recovered stale superuser sessions before login. Sessions cleared: ${activeSessions.length}`,
            });
          } else {
            await this.deps.storage.createAuditLog({
              action: "LOGIN_BLOCKED_SINGLE_SESSION",
              performedBy: user.username,
              details: `Superuser single-session policy blocked login. Active sessions: ${freshSessions.length}`,
            });
            throw new AuthAccountError(
              409,
              "SUPERUSER_SINGLE_SESSION_ENFORCED",
              "Single superuser session is enforced. Logout from the current session first.",
            );
          }
        }
      }
    } else if (user.role === "admin" && input.fingerprint) {
      await this.deps.storage.deactivateUserSessionsByFingerprint(user.username, input.fingerprint);
    }

    const activity = await this.deps.storage.createActivity({
      userId: user.id,
      username: user.username,
      role: user.role,
      pcName: input.pcName ?? null,
      browser: input.browserName,
      fingerprint: input.fingerprint ?? null,
      ipAddress: input.ipAddress ?? null,
    });

    await this.deps.storage.touchLastLogin(user.id, new Date());
    await this.deps.storage.createAuditLog({
      action: "LOGIN_SUCCESS",
      performedBy: user.username,
      targetUser: user.id,
      details,
    });

    return activity;
  }

  private async clearFailedLoginState(
    user: NonNullable<Awaited<ReturnType<PostgresStorage["getUser"]>>>,
  ) {
    if (
      Number(user.failedLoginAttempts || 0) <= 0
      && !user.lockedAt
      && user.lockedBySystem !== true
      && !String(user.lockedReason || "").trim()
    ) {
      return user;
    }

    return (await this.deps.storage.updateUserAccount({
      userId: user.id,
      failedLoginAttempts: 0,
      lockedAt: null,
      lockedReason: null,
      lockedBySystem: false,
    })) ?? user;
  }

  private async failLockedLogin(
    user: NonNullable<Awaited<ReturnType<PostgresStorage["getUser"]>>>,
    action: string,
    details: string,
  ): Promise<never> {
    await this.deps.storage.createAuditLog({
      action,
      performedBy: user.username,
      targetUser: user.id,
      details,
    });
    throw new AuthAccountError(
      423,
      ERROR_CODES.ACCOUNT_LOCKED,
      AuthAccountAuthenticationOperations.LOCKED_ACCOUNT_MESSAGE,
      {
        locked: true,
      },
    );
  }

  private async handleFailedPasswordAttempt(
    user: NonNullable<Awaited<ReturnType<PostgresStorage["getUser"]>>>,
    input: Omit<LoginInput, "password">,
  ): Promise<never> {
    const result = await this.deps.storage.recordFailedLoginAttempt({
      userId: user.id,
      maxAllowedAttempts: AuthAccountAuthenticationOperations.MAX_ALLOWED_FAILED_PASSWORD_ATTEMPTS,
      lockedReason: AuthAccountAuthenticationOperations.LOCKED_ACCOUNT_REASON,
    });

    await this.deps.storage.createAuditLog({
      action: result.locked ? "LOGIN_FAILED_PASSWORD_LOCKED" : "LOGIN_FAILED_PASSWORD",
      performedBy: user.username,
      targetUser: user.id,
      details: JSON.stringify({
        metadata: {
          browser: input.browserName,
          failed_login_attempts: result.failedLoginAttempts,
          locked: result.locked,
        },
      }),
    });

    if (result.newlyLocked) {
      const closedSessionIds = await this.invalidateUserSessions(
        user.username,
        "ACCOUNT_LOCKED_FAILED_LOGINS",
      );
      await this.deps.storage.createAuditLog({
        action: "ACCOUNT_LOCKED_TOO_MANY_FAILED_LOGINS",
        performedBy: user.username,
        targetUser: user.id,
        details: JSON.stringify({
          metadata: {
            browser: input.browserName,
            failed_login_attempts: result.failedLoginAttempts,
            locked_reason: AuthAccountAuthenticationOperations.LOCKED_ACCOUNT_REASON,
            locked_by_system: true,
            closed_session_ids: closedSessionIds,
          },
        }),
      });
    }

    if (result.locked) {
      throw new AuthAccountError(
        423,
        ERROR_CODES.ACCOUNT_LOCKED,
        AuthAccountAuthenticationOperations.LOCKED_ACCOUNT_MESSAGE,
        {
          locked: true,
        },
      );
    }

    throw new AuthAccountError(401, ERROR_CODES.INVALID_CREDENTIALS, "Invalid credentials");
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
        await this.failLockedLogin(
          user,
          "LOGIN_BLOCKED_LOCKED_ACCOUNT",
          "Login blocked because the account is locked after repeated failed password attempts.",
        );
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
      await this.handleFailedPasswordAttempt(user, {
        username: user.username,
        fingerprint: input.fingerprint,
        browserName: input.browserName,
        pcName: input.pcName,
        ipAddress: input.ipAddress,
      });
    }

    const unlockedUser = await this.clearFailedLoginState(user);

    if (this.requiresTwoFactor(unlockedUser)) {
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

    const activity = await this.createAuthenticatedSession(
      unlockedUser,
      input,
      `Login from ${input.browserName}`,
    );

    return {
      kind: "authenticated" as const,
      user: unlockedUser,
      activity,
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
        await this.failLockedLogin(
          user,
          "LOGIN_2FA_BLOCKED_LOCKED_ACCOUNT",
          "Second-factor login blocked because the account is locked after repeated failed password attempts.",
        );
      }

      await this.deps.storage.createAuditLog({
        action: "LOGIN_2FA_FAILED_ACCOUNT_STATE",
        performedBy: user.username,
        targetUser: user.id,
        details: `Second-factor login blocked due to account state: ${blockReason}`,
      });
      throw new AuthAccountError(401, ERROR_CODES.INVALID_CREDENTIALS, "Invalid credentials");
    }

    if (!this.requiresTwoFactor(user)) {
      throw new AuthAccountError(409, ERROR_CODES.TWO_FACTOR_NOT_ENABLED, "Two-factor authentication is not enabled.");
    }

    const encryptedSecret = String(user.twoFactorSecretEncrypted || "").trim();
    let secret = "";
    try {
      secret = decryptTwoFactorSecret(encryptedSecret);
    } catch {
      await this.deps.storage.createAuditLog({
        action: "LOGIN_2FA_FAILED_SECRET",
        performedBy: user.username,
        targetUser: user.id,
        details: "Stored two-factor secret could not be decrypted.",
      });
      throw new AuthAccountError(500, ERROR_CODES.TWO_FACTOR_SECRET_INVALID, "Two-factor authentication is unavailable.");
    }

    if (!verifyTwoFactorCode(secret, input.code)) {
      await this.deps.storage.createAuditLog({
        action: "LOGIN_2FA_FAILED",
        performedBy: user.username,
        targetUser: user.id,
        details: `Invalid authenticator code from ${input.browserName}`,
      });
      throw new AuthAccountError(401, ERROR_CODES.TWO_FACTOR_INVALID_CODE, "Authenticator code is invalid.");
    }

    const activity = await this.createAuthenticatedSession(
      user,
      {
        fingerprint: input.fingerprint,
        browserName: input.browserName,
        pcName: input.pcName,
        ipAddress: input.ipAddress,
      },
      `Login with 2FA from ${input.browserName}`,
    );

    return {
      user,
      activity,
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

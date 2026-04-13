import {
  normalizeUsernameInput,
} from "../auth/credentials";
import {
  getAccountAccessBlockReason,
} from "../auth/account-lifecycle";
import {
  verifyPassword,
} from "../auth/passwords";
import { ERROR_CODES } from "../../shared/error-codes";
import {
  type AuthAccountAuthenticationStorage,
  clearFailedLoginState,
  createAuthenticatedSession,
  failLockedLogin,
  handleFailedPasswordAttempt,
  invalidateUserSessions,
  requiresTwoFactor,
  verifyTwoFactorSecretCode,
} from "./auth-account-authentication-utils";
import {
  AuthAccountError,
} from "./auth-account-types";
import type {
  LoginInput,
  TwoFactorLoginInput,
} from "./auth-account-service-shared";

type AuthAccountAuthenticationDeps = {
  storage: AuthAccountAuthenticationStorage;
};

export class AuthAccountAuthenticationOperations {
  private static readonly MAX_ALLOWED_FAILED_PASSWORD_ATTEMPTS = 3;
  private static readonly LOCKED_ACCOUNT_REASON = "too_many_failed_password_attempts";
  private static readonly LOCKED_ACCOUNT_MESSAGE =
    "Your account has been locked due to too many incorrect login attempts. Please contact the system administrator.";

  constructor(private readonly deps: AuthAccountAuthenticationDeps) {}

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
      throw new AuthAccountError(403, ERROR_CODES.ACCOUNT_BANNED, "Account is banned", {
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
      throw new AuthAccountError(404, ERROR_CODES.USER_NOT_FOUND, "User not found.");
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
      throw new AuthAccountError(403, ERROR_CODES.ACCOUNT_BANNED, "Account is banned", {
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
}

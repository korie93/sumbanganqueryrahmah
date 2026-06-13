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
  type AuthAccountUser,
  clearFailedLoginState,
  createAuthenticatedSession,
  failLockedLogin,
  handleFailedPasswordAttempt,
  invalidateUserSessions,
  recordTwoFactorLoginFailureAudit,
  requiresTwoFactor,
  verifyTwoFactorSecretCode,
} from "./auth-account-authentication-utils";
import {
  AuthAccountError,
} from "./auth-account-types";
import {
  assertLoginAllowedDuringMaintenance,
  type AuthMaintenanceStateLoader,
} from "./auth-account-maintenance-policy";
import { getDeviceFingerprintLookupCandidates } from "../auth/device-fingerprint";
import type {
  LoginInput,
  TwoFactorLoginInput,
} from "./auth-account-service-shared";
import {
  FAILED_LOGIN_LOCKOUT_REASON,
  getSystemFailedLoginLockoutStatus,
} from "./auth-account-lockout-policy";
import { buildSecurityAuditDetails } from "../lib/security-audit-log";
import { buildLoginFailureAuditDetails } from "../lib/login-audit";
import { t } from "../i18n/server";

type AuthAccountAuthenticationDeps = {
  storage: AuthAccountAuthenticationStorage;
  getMaintenanceState?: AuthMaintenanceStateLoader | undefined;
};

async function isVisitorBannedByDeviceFingerprint(params: {
  fingerprint?: string | null | undefined;
  ipAddress?: string | null | undefined;
  storage: AuthAccountAuthenticationStorage;
  username: string;
}) {
  const lookupCandidates = getDeviceFingerprintLookupCandidates(params.fingerprint);
  if (lookupCandidates.length === 0) {
    return params.storage.isVisitorBanned(null, params.ipAddress ?? null, params.username);
  }

  for (const fingerprint of lookupCandidates) {
    if (await params.storage.isVisitorBanned(fingerprint, params.ipAddress ?? null, params.username)) {
      return true;
    }
  }
  return false;
}

async function clearExpiredSystemFailedLoginLockout(
  storage: Pick<AuthAccountAuthenticationStorage, "createAuditLog" | "updateUserAccount">,
  user: AuthAccountUser,
): Promise<AuthAccountUser> {
  const lockoutStatus = getSystemFailedLoginLockoutStatus(user);
  if (!lockoutStatus.expired) {
    return user;
  }

  const clearedUser = await clearFailedLoginState(storage, user);
  await storage.createAuditLog({
    action: "ACCOUNT_LOCKOUT_AUTO_CLEARED",
    performedBy: user.username,
    targetUser: user.id,
    details: buildSecurityAuditDetails({
      event: "AUTH_ACCOUNT_UNLOCKED",
      outcome: "success",
      actorId: user.id,
      metadata: {
        failed_login_attempts: lockoutStatus.attempts,
        lockout_duration_ms: lockoutStatus.lockoutMs,
        reason: "lockout_expired",
      },
      message: "System failed-login lockout expired and was cleared.",
    }),
  });
  return clearedUser;
}

export class AuthAccountAuthenticationOperations {
  private static readonly MAX_ALLOWED_FAILED_PASSWORD_ATTEMPTS = 3;
  private static readonly LOCKED_ACCOUNT_REASON = FAILED_LOGIN_LOCKOUT_REASON;
  private static readonly LOCKED_ACCOUNT_MESSAGE = t("auth.accountLocked");

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
        details: buildLoginFailureAuditDetails({
          browserName: input.browserName,
          failureReason: "user_not_found",
          ipAddress: input.ipAddress,
          message: "Login failed because the supplied account was not found.",
          role: "unknown",
        }),
      });
      throw new AuthAccountError(401, ERROR_CODES.INVALID_CREDENTIALS, t("auth.invalidCredentials"));
    }

    let activeUser = user;

    const visitorBanned = await isVisitorBannedByDeviceFingerprint({
      fingerprint: input.fingerprint,
      ipAddress: input.ipAddress,
      storage: this.deps.storage,
      username: activeUser.username,
    });

    if (visitorBanned || activeUser.isBanned) {
      await this.deps.storage.createAuditLog({
        action: "LOGIN_FAILED_BANNED",
        performedBy: activeUser.username,
        targetUser: activeUser.id,
        details: buildLoginFailureAuditDetails({
          actorId: activeUser.id,
          browserName: input.browserName,
          failureReason: visitorBanned ? "visitor_banned" : "account_banned",
          ipAddress: input.ipAddress,
          message: "Login blocked because the account or visitor is banned.",
          outcome: "blocked",
          role: activeUser.role,
        }),
      });
      throw new AuthAccountError(403, ERROR_CODES.ACCOUNT_BANNED, t("auth.accountBanned"), {
        banned: true,
      });
    }

    activeUser = await clearExpiredSystemFailedLoginLockout(this.deps.storage, activeUser);

    const blockReason = getAccountAccessBlockReason(activeUser);
    if (blockReason && blockReason !== "banned") {
      if (blockReason === "locked") {
        await failLockedLogin(this.deps.storage, activeUser, {
          action: "LOGIN_BLOCKED_LOCKED_ACCOUNT",
          browserName: input.browserName,
          details: "Login blocked because the account is locked after repeated failed password attempts.",
          ipAddress: input.ipAddress,
          lockedAccountMessage: AuthAccountAuthenticationOperations.LOCKED_ACCOUNT_MESSAGE,
        });
      }

      await this.deps.storage.createAuditLog({
        action: "LOGIN_FAILED_ACCOUNT_STATE",
        performedBy: activeUser.username,
        targetUser: activeUser.id,
        details: buildLoginFailureAuditDetails({
          actorId: activeUser.id,
          browserName: input.browserName,
          failureReason: `account_${blockReason}`,
          ipAddress: input.ipAddress,
          message: "Login blocked because the account state does not permit access.",
          outcome: "blocked",
          role: activeUser.role,
        }),
      });
      throw new AuthAccountError(401, ERROR_CODES.INVALID_CREDENTIALS, t("auth.invalidCredentials"));
    }

    const validPassword = await verifyPassword(password, activeUser.passwordHash);
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
        user: activeUser,
      });
    }

    const unlockedUser = await clearFailedLoginState(this.deps.storage, activeUser);

    await assertLoginAllowedDuringMaintenance({
      getMaintenanceState: this.deps.getMaintenanceState,
      role: unlockedUser.role,
      createAuditLog: () => this.deps.storage.createAuditLog({
        action: "LOGIN_BLOCKED_MAINTENANCE",
        performedBy: unlockedUser.username,
        targetUser: unlockedUser.id,
        details: buildLoginFailureAuditDetails({
          actorId: unlockedUser.id,
          browserName: input.browserName,
          failureReason: "maintenance_active",
          ipAddress: input.ipAddress,
          message: "Login blocked because hard maintenance mode is active.",
          outcome: "blocked",
          role: unlockedUser.role,
        }),
      }).then(() => undefined),
    });

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

    let activeUser = user;

    const visitorBanned = await isVisitorBannedByDeviceFingerprint({
      fingerprint: input.fingerprint,
      ipAddress: input.ipAddress,
      storage: this.deps.storage,
      username: activeUser.username,
    });

    if (visitorBanned || activeUser.isBanned) {
      await this.deps.storage.createAuditLog({
        action: "LOGIN_2FA_FAILED_BANNED",
        performedBy: activeUser.username,
        targetUser: activeUser.id,
        details: buildLoginFailureAuditDetails({
          actorId: activeUser.id,
          browserName: input.browserName,
          failureReason: visitorBanned ? "visitor_banned" : "account_banned",
          ipAddress: input.ipAddress,
          message: "Two-factor login blocked because the account or visitor is banned.",
          outcome: "blocked",
          role: activeUser.role,
        }),
      });
      throw new AuthAccountError(403, ERROR_CODES.ACCOUNT_BANNED, t("auth.accountBanned"), {
        banned: true,
      });
    }

    activeUser = await clearExpiredSystemFailedLoginLockout(this.deps.storage, activeUser);

    const blockReason = getAccountAccessBlockReason(activeUser);
    if (blockReason && blockReason !== "banned") {
      if (blockReason === "locked") {
        await failLockedLogin(this.deps.storage, activeUser, {
          action: "LOGIN_2FA_BLOCKED_LOCKED_ACCOUNT",
          browserName: input.browserName,
          details: "Second-factor login blocked because the account is locked after repeated failed password attempts.",
          ipAddress: input.ipAddress,
          lockedAccountMessage: AuthAccountAuthenticationOperations.LOCKED_ACCOUNT_MESSAGE,
        });
      }

      await this.deps.storage.createAuditLog({
        action: "LOGIN_2FA_FAILED_ACCOUNT_STATE",
        performedBy: activeUser.username,
        targetUser: activeUser.id,
        details: buildLoginFailureAuditDetails({
          actorId: activeUser.id,
          browserName: input.browserName,
          failureReason: `account_${blockReason}`,
          ipAddress: input.ipAddress,
          message: "Two-factor login blocked because the account state does not permit access.",
          outcome: "blocked",
          role: activeUser.role,
        }),
      });
      throw new AuthAccountError(401, ERROR_CODES.INVALID_CREDENTIALS, t("auth.invalidCredentials"));
    }

    await assertLoginAllowedDuringMaintenance({
      getMaintenanceState: this.deps.getMaintenanceState,
      role: activeUser.role,
      createAuditLog: () => this.deps.storage.createAuditLog({
        action: "LOGIN_2FA_BLOCKED_MAINTENANCE",
        performedBy: activeUser.username,
        targetUser: activeUser.id,
        details: buildLoginFailureAuditDetails({
          actorId: activeUser.id,
          browserName: input.browserName,
          failureReason: "maintenance_active",
          ipAddress: input.ipAddress,
          message: "Second-factor login blocked because hard maintenance mode is active.",
          outcome: "blocked",
          role: activeUser.role,
        }),
      }).then(() => undefined),
    });

    if (!requiresTwoFactor(activeUser)) {
      throw new AuthAccountError(409, ERROR_CODES.TWO_FACTOR_NOT_ENABLED, t("auth.twoFactorNotEnabled"));
    }

    const encryptedSecret = String(activeUser.twoFactorSecretEncrypted || "").trim();
    try {
      await verifyTwoFactorSecretCode({
        code: input.code,
        encryptedSecret,
        replay: {
          purpose: "login",
          subjectId: activeUser.id,
        },
      });
    } catch (error) {
      if (
        error instanceof AuthAccountError
        && error.code === ERROR_CODES.TWO_FACTOR_SECRET_INVALID
      ) {
        await recordTwoFactorLoginFailureAudit({
          browserName: input.browserName,
          failureReason: "secret_invalid",
          ipAddress: input.ipAddress,
          pcName: input.pcName,
          retryCount: activeUser.failedLoginAttempts,
          storage: this.deps.storage,
          user: activeUser,
        });
        throw error;
      }
      await recordTwoFactorLoginFailureAudit({
        browserName: input.browserName,
        failureReason: "invalid_code",
        ipAddress: input.ipAddress,
        pcName: input.pcName,
        retryCount: activeUser.failedLoginAttempts,
        storage: this.deps.storage,
        user: activeUser,
      });
      throw error;
    }

    const sessionResult = await createAuthenticatedSession({
      details: `Login with 2FA from ${input.browserName}`,
      input: {
        fingerprint: input.fingerprint,
        browserName: input.browserName,
        deviceType: input.deviceType,
        pcName: input.pcName,
        ipAddress: input.ipAddress,
        platform: input.platform,
      },
      storage: this.deps.storage,
      user: activeUser,
    });

    return {
      user: activeUser,
      activity: sessionResult.activity,
      closedSessionIds: sessionResult.closedSessionIds,
    };
  }
}

import {
  decryptTwoFactorSecret,
  verifyTwoFactorCode,
} from "../auth/two-factor";
import type { PostgresStorage } from "../storage-postgres";
import { ERROR_CODES } from "../../shared/error-codes";
import { AuthAccountError } from "./auth-account-types";
import type {
  AuthAccountAuthenticationStorage,
  AuthAccountUser,
  AuthenticatedSessionInput,
} from "./auth-account-authentication-shared";

export function requiresTwoFactor(
  user: Awaited<ReturnType<PostgresStorage["getUser"]>>,
) {
  return (
    (user?.role === "superuser" || user?.role === "admin")
    && user?.twoFactorEnabled === true
    && Boolean(String(user?.twoFactorSecretEncrypted || "").trim())
  );
}

export async function getSuperuserSessionIdleWindowMs(
  storage: Pick<AuthAccountAuthenticationStorage, "getAppConfig">,
): Promise<number> {
  const fallbackMinutes = 30;
  try {
    const runtime = await storage.getAppConfig?.();
    const configuredMinutes = Number(runtime?.sessionTimeoutMinutes);
    const safeMinutes = Number.isFinite(configuredMinutes)
      ? Math.min(1440, Math.max(1, Math.floor(configuredMinutes)))
      : fallbackMinutes;
    return safeMinutes * 60 * 1000;
  } catch {
    return fallbackMinutes * 60 * 1000;
  }
}

export function isRecentActivitySession(
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

export async function invalidateUserSessions(
  storage: Pick<AuthAccountAuthenticationStorage, "deactivateUserActivities" | "getActiveActivitiesByUsername">,
  username: string,
  reason: string,
) {
  const activeSessions = await storage.getActiveActivitiesByUsername(username);
  await storage.deactivateUserActivities(username, reason);
  return activeSessions.map((activity) => activity.id);
}

export async function replaceExistingSessionsForLogin(
  storage: Pick<
    AuthAccountAuthenticationStorage,
    "createAuditLog" | "deactivateUserActivities" | "getActiveActivitiesByUsername"
  >,
  user: AuthAccountUser,
  browserName: string,
) {
  const activeSessions = await storage.getActiveActivitiesByUsername(user.username);
  if (activeSessions.length === 0) {
    return [] as string[];
  }

  await storage.deactivateUserActivities(user.username, "NEW_SESSION");
  await storage.createAuditLog({
    action: "LOGIN_REPLACED_EXISTING_SESSION",
    performedBy: user.username,
    targetUser: user.id,
    details: JSON.stringify({
      metadata: {
        browser: browserName,
        replaced_session_count: activeSessions.length,
        replaced_session_ids: activeSessions.map((activity) => activity.id),
      },
    }),
  });

  return activeSessions.map((activity) => activity.id);
}

export async function createAuthenticatedSession(params: {
  details: string;
  input: AuthenticatedSessionInput;
  storage: Pick<
    AuthAccountAuthenticationStorage,
    | "createActivity"
    | "createAuditLog"
    | "deactivateUserActivities"
    | "getActiveActivitiesByUsername"
    | "getAppConfig"
    | "getBooleanSystemSetting"
    | "touchLastLogin"
  >;
  user: AuthAccountUser;
}) {
  let closedSessionIds: string[] = [];

  if (params.user.role === "superuser") {
    const enforceSingleSession = await params.storage.getBooleanSystemSetting(
      "enforce_superuser_single_session",
      false,
    );

    if (enforceSingleSession) {
      const activeSessions = await params.storage.getActiveActivitiesByUsername(params.user.username);
      if (activeSessions.length > 0) {
        const nowMs = Date.now();
        const idleWindowMs = await getSuperuserSessionIdleWindowMs(params.storage);
        const freshSessions = activeSessions.filter((session) =>
          isRecentActivitySession(session, nowMs, idleWindowMs),
        );

        if (freshSessions.length === 0) {
          await params.storage.deactivateUserActivities(params.user.username, "IDLE_TIMEOUT");
          closedSessionIds = activeSessions.map((activity) => activity.id);
          await params.storage.createAuditLog({
            action: "LOGIN_STALE_SESSION_RECOVERED",
            performedBy: params.user.username,
            targetUser: params.user.id,
            details: `Recovered stale superuser sessions before login. Sessions cleared: ${activeSessions.length}`,
          });
        } else {
          await params.storage.createAuditLog({
            action: "LOGIN_BLOCKED_SINGLE_SESSION",
            performedBy: params.user.username,
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
  }

  if (params.user.role !== "superuser" || closedSessionIds.length === 0) {
    closedSessionIds = await replaceExistingSessionsForLogin(
      params.storage,
      params.user,
      params.input.browserName,
    );
  }

  const activity = await params.storage.createActivity({
    userId: params.user.id,
    username: params.user.username,
    role: params.user.role,
    pcName: params.input.pcName ?? null,
    browser: params.input.browserName,
    fingerprint: params.input.fingerprint ?? null,
    ipAddress: params.input.ipAddress ?? null,
  });

  await params.storage.touchLastLogin(params.user.id, new Date());
  await params.storage.createAuditLog({
    action: "LOGIN_SUCCESS",
    performedBy: params.user.username,
    targetUser: params.user.id,
    details: params.details,
  });

  return {
    activity,
    closedSessionIds,
  };
}

export async function clearFailedLoginState(
  storage: Pick<AuthAccountAuthenticationStorage, "updateUserAccount">,
  user: AuthAccountUser,
) {
  if (
    Number(user.failedLoginAttempts || 0) <= 0
    && !user.lockedAt
    && user.lockedBySystem !== true
    && !String(user.lockedReason || "").trim()
  ) {
    return user;
  }

  return (await storage.updateUserAccount({
    userId: user.id,
    failedLoginAttempts: 0,
    lockedAt: null,
    lockedReason: null,
    lockedBySystem: false,
  })) ?? user;
}

export async function failLockedLogin(
  storage: Pick<AuthAccountAuthenticationStorage, "createAuditLog">,
  user: AuthAccountUser,
  params: {
    action: string;
    details: string;
    lockedAccountMessage: string;
  },
): Promise<never> {
  await storage.createAuditLog({
    action: params.action,
    performedBy: user.username,
    targetUser: user.id,
    details: params.details,
  });
  throw new AuthAccountError(
    423,
    ERROR_CODES.ACCOUNT_LOCKED,
    params.lockedAccountMessage,
    {
      locked: true,
    },
  );
}

export async function handleFailedPasswordAttempt(params: {
  input: Pick<AuthenticatedSessionInput, "browserName" | "fingerprint" | "ipAddress" | "pcName">;
  lockedAccountMessage: string;
  lockedReason: string;
  maxAllowedAttempts: number;
  storage: Pick<
    AuthAccountAuthenticationStorage,
    | "createAuditLog"
    | "deactivateUserActivities"
    | "getActiveActivitiesByUsername"
    | "recordFailedLoginAttempt"
  >;
  user: AuthAccountUser;
}): Promise<never> {
  const result = await params.storage.recordFailedLoginAttempt({
    userId: params.user.id,
    maxAllowedAttempts: params.maxAllowedAttempts,
    lockedReason: params.lockedReason,
  });

  await params.storage.createAuditLog({
    action: result.locked ? "LOGIN_FAILED_PASSWORD_LOCKED" : "LOGIN_FAILED_PASSWORD",
    performedBy: params.user.username,
    targetUser: params.user.id,
    details: JSON.stringify({
      metadata: {
        browser: params.input.browserName,
        failed_login_attempts: result.failedLoginAttempts,
        locked: result.locked,
      },
    }),
  });

  if (result.newlyLocked) {
    const closedSessionIds = await invalidateUserSessions(
      params.storage,
      params.user.username,
      "ACCOUNT_LOCKED_FAILED_LOGINS",
    );
    await params.storage.createAuditLog({
      action: "ACCOUNT_LOCKED_TOO_MANY_FAILED_LOGINS",
      performedBy: params.user.username,
      targetUser: params.user.id,
      details: JSON.stringify({
        metadata: {
          browser: params.input.browserName,
          failed_login_attempts: result.failedLoginAttempts,
          locked_reason: params.lockedReason,
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
      params.lockedAccountMessage,
      {
        locked: true,
      },
    );
  }

  throw new AuthAccountError(401, ERROR_CODES.INVALID_CREDENTIALS, "Invalid credentials");
}

export function verifyTwoFactorSecretCode(params: {
  code: string;
  encryptedSecret: string;
}): {
  ok: true;
} {
  let secret = "";
  try {
    secret = decryptTwoFactorSecret(params.encryptedSecret);
  } catch {
    throw new AuthAccountError(
      500,
      ERROR_CODES.TWO_FACTOR_SECRET_INVALID,
      "Two-factor authentication is unavailable.",
    );
  }

  if (!verifyTwoFactorCode(secret, params.code)) {
    throw new AuthAccountError(
      401,
      ERROR_CODES.TWO_FACTOR_INVALID_CODE,
      "Authenticator code is invalid.",
    );
  }

  return { ok: true };
}

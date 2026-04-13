import { AuthAccountError } from "./auth-account-types";
import type {
  AuthAccountAuthenticationStorage,
  AuthAccountUser,
  AuthenticatedSessionInput,
} from "./auth-account-authentication-shared";
import { resolveTimestampMs } from "../lib/timestamp";
import { ERROR_CODES } from "../../shared/error-codes";

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
  const activityMs = resolveTimestampMs(timestampSource);
  if (!Number.isFinite(activityMs)) {
    return true;
  }
  return nowMs - activityMs <= idleWindowMs;
}

export async function invalidateUserSessions(
  storage: Pick<
    AuthAccountAuthenticationStorage,
    "deactivateUserActivities" | "getActiveActivitiesByUsername"
  >,
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
            ERROR_CODES.SUPERUSER_SINGLE_SESSION_ENFORCED,
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

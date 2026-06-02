import {
  decryptTwoFactorSecretPayload,
  verifyTwoFactorCode,
} from "../auth/two-factor";
import {
  consumeTwoFactorReplayCode,
  type TwoFactorReplayPurpose,
} from "../auth/two-factor-replay-cache";
import type { PostgresStorage } from "../storage-postgres";
import { ERROR_CODES } from "../../shared/error-codes";
import { getRequestContext } from "../lib/request-context";
import { buildSecurityAuditDetails } from "../lib/security-audit-log";
import { t } from "../i18n/server";
import { AuthAccountError } from "./auth-account-types";
import type {
  AuthAccountAuthenticationStorage,
  AuthAccountUser,
  AuthenticatedSessionInput,
} from "./auth-account-authentication-shared";
import { invalidateUserSessions } from "./auth-account-session-lifecycle-utils";

export function requiresTwoFactor(
  user: Awaited<ReturnType<PostgresStorage["getUser"]>>,
) {
  return (
    (user?.role === "superuser" || user?.role === "admin")
    && user?.twoFactorEnabled === true
    && Boolean(String(user?.twoFactorSecretEncrypted || "").trim())
  );
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
    details: buildSecurityAuditDetails({
      event: "AUTH_LOGIN_FAILURE",
      outcome: "blocked",
      actorId: user.id,
      metadata: {
        reason: "account_locked",
      },
      message: params.details,
    }),
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
    details: buildSecurityAuditDetails({
      event: "AUTH_LOGIN_FAILURE",
      outcome: result.locked ? "blocked" : "failure",
      actorId: params.user.id,
      ipAddress: params.input.ipAddress,
      userAgent: params.input.browserName,
      metadata: {
        failed_login_attempts: result.failedLoginAttempts,
        locked: result.locked,
        reason: "invalid_password",
      },
      message: "Password login failed.",
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
      details: buildSecurityAuditDetails({
        event: "AUTH_ACCOUNT_LOCKED",
        outcome: "blocked",
        actorId: params.user.id,
        ipAddress: params.input.ipAddress,
        userAgent: params.input.browserName,
        metadata: {
          failed_login_attempts: result.failedLoginAttempts,
          locked_reason: params.lockedReason,
          locked_by_system: true,
          closed_count: closedSessionIds.length,
        },
        message: "Account locked after repeated failed password attempts.",
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

  throw new AuthAccountError(401, ERROR_CODES.INVALID_CREDENTIALS, t("auth.invalidCredentials"));
}

export async function verifyTwoFactorSecretCode(params: {
  code: string;
  encryptedSecret: string;
  replay?: {
    purpose: TwoFactorReplayPurpose;
    subjectId: string;
  };
}): Promise<{
  ok: true;
}> {
  let secretPayload: ReturnType<typeof decryptTwoFactorSecretPayload>;
  try {
    secretPayload = decryptTwoFactorSecretPayload(params.encryptedSecret);
  } catch {
    throw new AuthAccountError(
      500,
      ERROR_CODES.TWO_FACTOR_SECRET_INVALID,
      t("auth.twoFactorUnavailable"),
    );
  }

  if (!verifyTwoFactorCode(secretPayload.secret, params.code, 1, secretPayload.algorithm)) {
    throw new AuthAccountError(
      401,
      ERROR_CODES.TWO_FACTOR_INVALID_CODE,
      t("auth.twoFactorInvalidCode"),
    );
  }

  if (
    params.replay
    && !(await consumeTwoFactorReplayCode({
      code: params.code,
      purpose: params.replay.purpose,
      subjectId: params.replay.subjectId,
    }))
  ) {
    throw new AuthAccountError(
      401,
      ERROR_CODES.TWO_FACTOR_INVALID_CODE,
      t("auth.twoFactorInvalidCode"),
    );
  }

  return { ok: true };
}

export async function recordTwoFactorLoginFailureAudit(params: {
  browserName: string;
  failureReason: "invalid_code" | "secret_invalid";
  ipAddress?: string | null | undefined;
  pcName?: string | null | undefined;
  retryCount?: number | null | undefined;
  storage: Pick<AuthAccountAuthenticationStorage, "createAuditLog">;
  user: AuthAccountUser;
}) {
  const requestContext = getRequestContext();
  await params.storage.createAuditLog({
    action: params.failureReason === "secret_invalid" ? "LOGIN_2FA_FAILED_SECRET" : "LOGIN_2FA_FAILED",
    performedBy: params.user.username,
    targetUser: params.user.id,
    details: buildSecurityAuditDetails({
      event: "AUTH_2FA_FAILURE",
      outcome: "failure",
      actorId: params.user.id,
      ipAddress: params.ipAddress ?? requestContext?.clientIp ?? null,
      requestId: requestContext?.requestId ?? null,
      userAgent: requestContext?.userAgent ?? params.browserName,
      metadata: {
        browser: params.browserName,
        failure_reason: params.failureReason,
        retry_count: Number.isFinite(Number(params.retryCount))
          ? Math.max(0, Math.trunc(Number(params.retryCount)))
          : null,
      },
      message: "Two-factor login failed.",
    }),
  });
}

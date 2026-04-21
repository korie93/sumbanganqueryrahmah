import {
  buildTwoFactorOtpAuthUrl,
  decryptTwoFactorSecret,
  encryptTwoFactorSecret,
  generateTwoFactorSecret,
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
import { invalidateUserSessions } from "./auth-account-session-lifecycle-utils";

export type MandatoryTwoFactorEnrollmentSetup = {
  accountName: string;
  issuer: string;
  otpauthUrl: string;
  secret: string;
};

export function requiresTwoFactor(
  user: Awaited<ReturnType<PostgresStorage["getUser"]>>,
) {
  return (
    (user?.role === "superuser" || user?.role === "admin")
    && user?.twoFactorEnabled === true
    && Boolean(String(user?.twoFactorSecretEncrypted || "").trim())
  );
}

export function requiresMandatoryTwoFactorEnrollment(
  user: Awaited<ReturnType<PostgresStorage["getUser"]>>,
) {
  if (!user) {
    return false;
  }

  if (user.role !== "admin" && user.role !== "superuser") {
    return false;
  }

  if (user.twoFactorEnabled === true && Boolean(String(user.twoFactorSecretEncrypted || "").trim())) {
    return false;
  }

  return true;
}

function buildMandatoryTwoFactorEnrollmentSetup(
  user: Pick<AuthAccountUser, "username">,
  secret: string,
): MandatoryTwoFactorEnrollmentSetup {
  return {
    accountName: user.username,
    issuer: "SQR",
    otpauthUrl: buildTwoFactorOtpAuthUrl({
      issuer: "SQR",
      username: user.username,
      secret,
    }),
    secret,
  };
}

export async function prepareMandatoryTwoFactorEnrollment(
  storage: Pick<AuthAccountAuthenticationStorage, "createAuditLog" | "updateUserAccount">,
  user: AuthAccountUser,
): Promise<{
  setup: MandatoryTwoFactorEnrollmentSetup;
  user: AuthAccountUser;
}> {
  let secret = "";
  let nextUser = user;
  const existingEncryptedSecret = String(user.twoFactorSecretEncrypted || "").trim();

  if (existingEncryptedSecret) {
    try {
      secret = decryptTwoFactorSecret(existingEncryptedSecret);
    } catch {
      secret = "";
    }
  }

  if (!secret) {
    const generatedSecret = generateTwoFactorSecret();
    let encryptedSecret = "";
    try {
      encryptedSecret = encryptTwoFactorSecret(generatedSecret);
    } catch {
      throw new AuthAccountError(
        503,
        ERROR_CODES.TWO_FACTOR_SECRET_INVALID,
        "Two-factor authentication setup is unavailable. Contact an administrator.",
      );
    }

    nextUser = (await storage.updateUserAccount({
      userId: user.id,
      twoFactorEnabled: false,
      twoFactorSecretEncrypted: encryptedSecret,
      twoFactorConfiguredAt: null,
    })) ?? user;
    secret = generatedSecret;

    await storage.createAuditLog({
      action: "TWO_FACTOR_SETUP_INITIATED",
      performedBy: user.username,
      targetUser: user.id,
      details: JSON.stringify({
        metadata: {
          role: user.role,
          source: "login",
        },
      }),
    });
  }

  return {
    setup: buildMandatoryTwoFactorEnrollmentSetup(nextUser, secret),
    user: nextUser,
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

  try {
    if (!verifyTwoFactorCode(secret, params.code)) {
      throw new AuthAccountError(
        401,
        ERROR_CODES.TWO_FACTOR_INVALID_CODE,
        "Authenticator code is invalid.",
      );
    }
  } catch (error) {
    if (error instanceof AuthAccountError) {
      throw error;
    }

    throw new AuthAccountError(
      500,
      ERROR_CODES.TWO_FACTOR_SECRET_INVALID,
      "Two-factor authentication is unavailable.",
    );
  }

  return { ok: true };
}

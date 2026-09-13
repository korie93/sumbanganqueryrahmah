import type { Response } from "express";
import { WebSocket } from "ws";
import {
  signSessionJwt,
  resolveSessionJwtExpiresAt,
  verifySessionJwt,
} from "../../auth/session-jwt";
import {
  calculateSessionExpiry,
  normalizeSessionExpiry,
} from "../../auth/session-lifetime";
import { setAuthSessionCookie } from "../../auth/session-cookie";
import { parseBrowser } from "../../lib/browser";
import { logger } from "../../lib/logger";
import { ERROR_CODES } from "../../../shared/error-codes";
import { AuthAccountError } from "../../services/auth-account.service";
import type { PostgresStorage } from "../../storage-postgres";

type ActivitySocketMessageType = "logout" | "banned";

type SessionTokenPayload = {
  userId: string;
  username: string;
  role: string;
  activityId: string;
};

export type SignedAuthSession = {
  expiresAt: string;
  expiresAtMs: number;
  token: string;
};

type TwoFactorChallengeTokenPayload = {
  credentialState: string;
  userId: string;
  username: string;
  role: string;
  fingerprint?: string | null | undefined;
  browserName: string;
  deviceType?: string | undefined;
  pcName?: string | null | undefined;
  ipAddress?: string | null | undefined;
  platform?: string | undefined;
};

type TwoFactorChallengeTokenClaims = {
  credentialState?: string;
  jti?: string;
  purpose?: string | undefined;
  userId?: string | undefined;
  username?: string | undefined;
  role?: string | undefined;
  fingerprint?: string | null | undefined;
  browserName?: string | undefined;
  deviceType?: string | undefined;
  pcName?: string | null | undefined;
  ipAddress?: string | null | undefined;
  platform?: string | undefined;
  iat?: number | undefined;
  exp?: number | undefined;
};

type CloseAuthActivitySocketsInput = {
  activityIds: string[];
  reason: string;
  messageType?: ActivitySocketMessageType | undefined;
  connectedClients: Map<string, WebSocket>;
  storage: Pick<PostgresStorage, "clearCollectionNicknameSessionByActivity">;
};

function firstHeaderValue(value: string | string[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function closeAuthActivitySockets({
  activityIds,
  reason,
  messageType = "logout",
  connectedClients,
  storage,
}: CloseAuthActivitySocketsInput) {
  for (const activityId of activityIds) {
    const socket = connectedClients.get(activityId);
    try {
      if (socket && socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(JSON.stringify({ type: messageType, reason }));
        } finally {
          socket.close();
        }
      }
    } catch {
      // One broken transport must not stop revocation of the remaining clients.
      // Do not log socket errors or the logout payload: either may contain data.
      try {
        socket?.terminate();
      } catch {
        // Registry and nickname cleanup below must survive termination failure.
      }
      logger.warn("Auth socket transport failed during revoked session cleanup", {
        operation: "closeAuthActivitySockets",
      });
    } finally {
      // A transport race must not retain a revoked client in the live registry.
      connectedClients.delete(activityId);
      void Promise.resolve()
        .then(() => storage.clearCollectionNicknameSessionByActivity(activityId))
        .catch(() => {
          logger.warn("Failed to clear nickname session after auth session cleanup", {
            activityId,
            operation: "clearCollectionNicknameSessionByActivity",
          });
        });
    }
  }
}

export function signAuthSessionToken(payload: SessionTokenPayload, res?: Response | null) {
  const token = signSessionJwt(payload);
  if (res) {
    setAuthSessionCookie(res, token);
  }
  return token;
}

export function signAuthSessionTokenWithExpiry(
  payload: SessionTokenPayload,
  res?: Response | null,
): SignedAuthSession {
  const token = signAuthSessionToken(payload, res);
  const tokenExpiry = normalizeSessionExpiry(resolveSessionJwtExpiresAt(token)) ?? calculateSessionExpiry();

  return {
    expiresAt: tokenExpiry.expiresAtIso,
    expiresAtMs: tokenExpiry.expiresAtMs,
    token,
  };
}

export function signAuthTwoFactorChallengeToken(payload: TwoFactorChallengeTokenPayload) {
  return signSessionJwt(
    {
      ...payload,
      purpose: "two_factor_login",
    },
    {
      expiresIn: "5m",
    },
  );
}

export function verifyAuthTwoFactorChallengeToken(token: string) {
  let decoded: TwoFactorChallengeTokenClaims;
  try {
    decoded = verifySessionJwt<TwoFactorChallengeTokenClaims>(token);
  } catch (error) {
    const expired = error instanceof Error && error.name === "TokenExpiredError";
    throw new AuthAccountError(401,
      expired ? ERROR_CODES.TWO_FACTOR_CHALLENGE_EXPIRED : ERROR_CODES.TWO_FACTOR_CHALLENGE_INVALID,
      expired ? "2FA session expired. Please sign in again."
        : "2FA session is invalid. Please sign in again.");
  }

  if (
    decoded.purpose !== "two_factor_login"
    || !decoded.userId
    || !decoded.username
    || !decoded.role
    || !decoded.browserName
    || !decoded.jti || !/^[0-9a-f-]{36}$/i.test(decoded.jti)
    || !decoded.credentialState || !/^[a-f0-9]{64}$/.test(decoded.credentialState)
    || !Number.isSafeInteger(decoded.exp)
  ) {
    throw new AuthAccountError(
      401,
      ERROR_CODES.TWO_FACTOR_CHALLENGE_INVALID,
      "Two-factor login challenge is invalid or expired.",
    );
  }

  return {
    purpose: "two_factor_login" as const,
    challengeId: decoded.jti,
    credentialState: decoded.credentialState,
    expiresAtMs: decoded.exp! * 1_000,
    userId: decoded.userId,
    username: decoded.username,
    role: decoded.role,
    fingerprint: decoded.fingerprint ?? null,
    browserName: decoded.browserName,
    deviceType: decoded.deviceType || "unknown",
    pcName: decoded.pcName ?? null,
    ipAddress: decoded.ipAddress ?? null,
    platform: decoded.platform || "Unknown",
    iat: decoded.iat,
    exp: decoded.exp,
  };
}

export function parseAuthBrowserName(
  browserHeader: string | string[] | null | undefined,
  userAgentHeader: string | string[] | undefined,
) {
  return parseBrowser(firstHeaderValue(browserHeader) || firstHeaderValue(userAgentHeader));
}

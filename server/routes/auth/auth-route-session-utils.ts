import type { Response } from "express";
import { WebSocket } from "ws";
import {
  signSessionJwt,
  verifySessionJwt,
  SESSION_JWT_DEFAULT_EXPIRY,
} from "../../auth/session-jwt";
import { setAuthSessionCookie } from "../../auth/session-cookie";
import { parseBrowser } from "../../lib/browser";
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

type TwoFactorChallengeTokenPayload = {
  userId: string;
  username: string;
  role: string;
  fingerprint?: string | null | undefined;
  browserName: string;
  pcName?: string | null | undefined;
  ipAddress?: string | null | undefined;
};

type TwoFactorChallengeTokenClaims = {
  purpose?: string | undefined;
  userId?: string | undefined;
  username?: string | undefined;
  role?: string | undefined;
  fingerprint?: string | null | undefined;
  browserName?: string | undefined;
  pcName?: string | null | undefined;
  ipAddress?: string | null | undefined;
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
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: messageType, reason }));
      socket.close();
    }
    connectedClients.delete(activityId);
    void storage.clearCollectionNicknameSessionByActivity(activityId);
  }
}

export function signAuthSessionToken(payload: SessionTokenPayload, res?: Response | null) {
  const token = signSessionJwt(payload, { expiresIn: SESSION_JWT_DEFAULT_EXPIRY });
  if (res) {
    setAuthSessionCookie(res, token);
  }
  return token;
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
  const decoded = verifySessionJwt<TwoFactorChallengeTokenClaims>(token);

  if (
    decoded.purpose !== "two_factor_login"
    || !decoded.userId
    || !decoded.username
    || !decoded.role
    || !decoded.browserName
  ) {
    throw new AuthAccountError(
      401,
      ERROR_CODES.TWO_FACTOR_CHALLENGE_INVALID,
      "Two-factor login challenge is invalid or expired.",
    );
  }

  return {
    purpose: "two_factor_login" as const,
    userId: decoded.userId,
    username: decoded.username,
    role: decoded.role,
    fingerprint: decoded.fingerprint ?? null,
    browserName: decoded.browserName,
    pcName: decoded.pcName ?? null,
    ipAddress: decoded.ipAddress ?? null,
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

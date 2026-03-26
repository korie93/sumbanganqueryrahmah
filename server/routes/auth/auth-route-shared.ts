import type { Express, RequestHandler, Response } from "express";
import { WebSocket } from "ws";
import type { AuthenticatedRequest } from "../../auth/guards";
import {
  signSessionJwt,
  verifySessionJwt,
  SESSION_JWT_DEFAULT_EXPIRY,
} from "../../auth/session-jwt";
import { setAuthSessionCookie } from "../../auth/session-cookie";
import { HttpError } from "../../http/errors";
import { parseBrowser } from "../../lib/browser";
import { ERROR_CODES } from "../../../shared/error-codes";
import {
  type ManagedAccountActivationDelivery,
  type ManagedAccountPasswordResetDelivery,
  AuthAccountError,
  AuthAccountService,
} from "../../services/auth-account.service";
import {
  createAuthRouteRateLimiters,
  type AuthRouteRateLimiters,
} from "../../middleware/rate-limit";
import type { PostgresStorage } from "../../storage-postgres";

export type AuthRouteDeps = {
  storage: PostgresStorage;
  authenticateToken: RequestHandler;
  requireRole: (...roles: string[]) => RequestHandler;
  connectedClients: Map<string, WebSocket>;
  rateLimiters?: Partial<AuthRouteRateLimiters>;
};

type JsonHandler = (
  req: AuthenticatedRequest,
  res: Response,
) => Promise<unknown>;

export type AuthRouteContext = {
  app: Express;
  storage: PostgresStorage;
  authAccountService: AuthAccountService;
  authenticateToken: RequestHandler;
  requireRole: (...roles: string[]) => RequestHandler;
  rateLimiters: AuthRouteRateLimiters;
  jsonRoute: (handler: JsonHandler) => RequestHandler;
  closeActivitySockets: (
    activityIds: string[],
    reason: string,
    messageType?: "logout" | "banned",
  ) => void;
  buildUserPayload: (user: Awaited<ReturnType<PostgresStorage["getUser"]>>) => {
    id: string;
    username: string;
    fullName: string | null;
    email: string | null;
    role: string;
    status: string | null;
    mustChangePassword: boolean | null;
    passwordResetBySuperuser: boolean | null;
    isBanned: boolean | null;
    twoFactorEnabled: boolean | null;
    twoFactorPendingSetup: boolean | null;
    twoFactorConfiguredAt: Date | null;
    activatedAt: Date | null;
    passwordChangedAt: Date | null;
    lastLoginAt: Date | null;
  } | null;
  buildManagedUserPayload: (user: Awaited<ReturnType<PostgresStorage["getManagedUsers"]>>[number]) => Record<string, unknown>;
  buildDeliveryPayload: (
    activation: ManagedAccountActivationDelivery | ManagedAccountPasswordResetDelivery,
  ) => Record<string, unknown>;
  buildOkPayload: <T extends Record<string, unknown>>(payload: T) => T & { ok: true };
  signSessionToken: (payload: { userId: string; username: string; role: string; activityId: string }, res?: Response | null) => string;
  signTwoFactorChallengeToken: (payload: {
    userId: string;
    username: string;
    role: string;
    fingerprint?: string | null;
    browserName: string;
    pcName?: string | null;
    ipAddress?: string | null;
  }) => string;
  verifyTwoFactorChallengeToken: (token: string) => {
    purpose: "two_factor_login";
    userId: string;
    username: string;
    role: string;
    fingerprint?: string | null;
    browserName: string;
    pcName?: string | null;
    ipAddress?: string | null;
    iat?: number;
    exp?: number;
  };
  parseBrowserName: (browserHeader: string | string[] | null | undefined, userAgentHeader: string | string[] | undefined) => string;
};

function buildManagedUserPayload(user: Awaited<ReturnType<PostgresStorage["getManagedUsers"]>>[number]) {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    passwordResetBySuperuser: user.passwordResetBySuperuser,
    createdBy: user.createdBy,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    activatedAt: user.activatedAt,
    lastLoginAt: user.lastLoginAt,
    passwordChangedAt: user.passwordChangedAt,
    isBanned: user.isBanned,
    failedLoginAttempts: user.failedLoginAttempts,
    lockedAt: user.lockedAt,
    lockedReason: user.lockedReason,
    lockedBySystem: user.lockedBySystem,
  };
}

function buildUserPayload(user: Awaited<ReturnType<PostgresStorage["getUser"]>>) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    passwordResetBySuperuser: user.passwordResetBySuperuser,
    isBanned: user.isBanned,
    twoFactorEnabled: user.twoFactorEnabled,
    twoFactorPendingSetup: Boolean(user.twoFactorSecretEncrypted) && user.twoFactorEnabled !== true,
    twoFactorConfiguredAt: user.twoFactorConfiguredAt,
    activatedAt: user.activatedAt,
    passwordChangedAt: user.passwordChangedAt,
    lastLoginAt: user.lastLoginAt,
  };
}

function buildDeliveryPayload(
  activation: ManagedAccountActivationDelivery | ManagedAccountPasswordResetDelivery,
) {
  return {
    deliveryMode: activation.deliveryMode,
    errorCode: activation.errorCode,
    errorMessage: activation.errorMessage,
    expiresAt: activation.expiresAt,
    previewUrl: activation.previewUrl,
    recipientEmail: activation.recipientEmail,
    sent: activation.sent,
  };
}

function buildOkPayload<T extends Record<string, unknown>>(payload: T): T & { ok: true } {
  return {
    ok: true,
    ...payload,
  };
}

function buildRouteErrorPayload(error: {
  message: string;
  code?: string;
  details?: unknown;
  extra?: Record<string, unknown>;
}) {
  return {
    ok: false,
    message: error.message,
    ...((error.code || error.details)
      ? {
          error: {
            ...(error.code ? { code: error.code } : {}),
            message: error.message,
            ...(error.details !== undefined ? { details: error.details } : {}),
          },
        }
      : {}),
    ...(error.extra || {}),
  };
}

export function createAuthRouteContext(app: Express, deps: AuthRouteDeps): AuthRouteContext {
  const { storage, authenticateToken, requireRole, connectedClients } = deps;
  const authAccountService = new AuthAccountService(storage);
  const rateLimiters: AuthRouteRateLimiters = {
    ...createAuthRouteRateLimiters(),
    ...deps.rateLimiters,
  };

  const sendAuthError = (res: Response, error: unknown) => {
    if (error instanceof AuthAccountError) {
      res.status(error.statusCode).json(buildRouteErrorPayload({
        code: error.code,
        details: undefined,
        extra: error.extra,
        message: error.message,
      }));
      return true;
    }

    if (error instanceof HttpError) {
      res.status(error.statusCode).json(buildRouteErrorPayload({
        code: error.code,
        details: error.details,
        message: error.message,
      }));
      return true;
    }

    return false;
  };

  return {
    app,
    storage,
    authAccountService,
    authenticateToken,
    requireRole,
    rateLimiters,
    jsonRoute: (handler) => async (req: AuthenticatedRequest, res) => {
      try {
        const payload = await handler(req, res);
        if (!res.headersSent && payload !== undefined) {
          res.json(payload);
        }
      } catch (error) {
        if (sendAuthError(res, error)) {
          return;
        }
        throw error;
      }
    },
    closeActivitySockets(activityIds, reason, messageType = "logout") {
      for (const activityId of activityIds) {
        const socket = connectedClients.get(activityId);
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: messageType, reason }));
          socket.close();
        }
        connectedClients.delete(activityId);
        void storage.clearCollectionNicknameSessionByActivity(activityId);
      }
    },
    buildUserPayload,
    buildManagedUserPayload,
    buildDeliveryPayload,
    buildOkPayload,
    signSessionToken(payload, res) {
      const token = signSessionJwt(payload, { expiresIn: SESSION_JWT_DEFAULT_EXPIRY });
      if (res) {
        setAuthSessionCookie(res, token);
      }
      return token;
    },
    signTwoFactorChallengeToken(payload) {
      return signSessionJwt(
        {
          ...payload,
          purpose: "two_factor_login",
        },
        {
          expiresIn: "5m",
        },
      );
    },
    verifyTwoFactorChallengeToken(token) {
      const decoded = verifySessionJwt<{
        purpose?: string;
        userId?: string;
        username?: string;
        role?: string;
        fingerprint?: string | null;
        browserName?: string;
        pcName?: string | null;
        ipAddress?: string | null;
        iat?: number;
        exp?: number;
      }>(token);

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
    },
    parseBrowserName(browserHeader, userAgentHeader) {
      const firstHeaderValue = (value: string | string[] | null | undefined) =>
        Array.isArray(value) ? value[0] : value;
      return parseBrowser(firstHeaderValue(browserHeader) || firstHeaderValue(userAgentHeader));
    },
  };
}

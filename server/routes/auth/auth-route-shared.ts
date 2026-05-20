import type { Express, RequestHandler, Response } from "express";
import { WebSocket } from "ws";
import {
  type ManagedAccountActivationDelivery,
  type ManagedAccountPasswordResetDelivery,
  AuthAccountService,
} from "../../services/auth-account.service";
import {
  createAuthRouteRateLimiters,
  type AuthRouteRateLimiters,
} from "../../middleware/rate-limit";
import type { MaintenanceState } from "../../config/system-settings";
import type { PostgresStorage } from "../../storage-postgres";
import {
  buildDeliveryPayload,
  buildManagedUserPayload,
  buildOkPayload,
  buildUserPayload,
  createAuthJsonRoute,
  type AuthRouteJsonHandler,
} from "./auth-route-response-utils";
import {
  closeAuthActivitySockets,
  parseAuthBrowserName,
  signAuthSessionTokenWithExpiry,
  signAuthTwoFactorChallengeToken,
  verifyAuthTwoFactorChallengeToken,
  type SignedAuthSession,
} from "./auth-route-session-utils";

export type AuthRouteDeps = {
  storage: PostgresStorage;
  authenticateToken: RequestHandler;
  requireRole: (...roles: string[]) => RequestHandler;
  connectedClients: Map<string, WebSocket>;
  rateLimiters?: Partial<AuthRouteRateLimiters>;
  getMaintenanceStateCached?: ((force?: boolean) => Promise<MaintenanceState>) | undefined;
};

type JsonHandler = AuthRouteJsonHandler;

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
  signSessionToken: (payload: { userId: string; username: string; role: string; activityId: string }, res?: Response | null) => SignedAuthSession;
  signTwoFactorChallengeToken: (payload: {
    userId: string;
    username: string;
    role: string;
    fingerprint?: string | null | undefined;
    browserName: string;
    pcName?: string | null | undefined;
    ipAddress?: string | null | undefined;
  }) => string;
  verifyTwoFactorChallengeToken: (token: string) => {
    purpose: "two_factor_login";
    userId: string;
    username: string;
    role: string;
    fingerprint?: string | null | undefined;
    browserName: string;
    pcName?: string | null | undefined;
    ipAddress?: string | null | undefined;
    iat?: number | undefined;
    exp?: number | undefined;
  };
  parseBrowserName: (browserHeader: string | string[] | null | undefined, userAgentHeader: string | string[] | undefined) => string;
};

export function createAuthRouteContext(app: Express, deps: AuthRouteDeps): AuthRouteContext {
  const { storage, authenticateToken, requireRole, connectedClients } = deps;
  const getMaintenanceState = deps.getMaintenanceStateCached;
  const authAccountService = new AuthAccountService(
    storage,
    getMaintenanceState
      ? { getMaintenanceState: () => getMaintenanceState() }
      : {},
  );
  const rateLimiters: AuthRouteRateLimiters = {
    ...createAuthRouteRateLimiters(),
    ...deps.rateLimiters,
  };

  return {
    app,
    storage,
    authAccountService,
    authenticateToken,
    requireRole,
    rateLimiters,
    jsonRoute: createAuthJsonRoute,
    closeActivitySockets(activityIds, reason, messageType = "logout") {
      closeAuthActivitySockets({
        activityIds,
        reason,
        messageType,
        connectedClients,
        storage,
      });
    },
    buildUserPayload,
    buildManagedUserPayload,
    buildDeliveryPayload,
    buildOkPayload,
    signSessionToken(payload, res) {
      return signAuthSessionTokenWithExpiry(payload, res);
    },
    signTwoFactorChallengeToken(payload) {
      return signAuthTwoFactorChallengeToken(payload);
    },
    verifyTwoFactorChallengeToken(token) {
      return verifyAuthTwoFactorChallengeToken(token);
    },
    parseBrowserName(browserHeader, userAgentHeader) {
      return parseAuthBrowserName(browserHeader, userAgentHeader);
    },
  };
}

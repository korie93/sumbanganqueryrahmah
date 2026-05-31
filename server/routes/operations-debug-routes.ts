import { timingSafeEqual } from "node:crypto";
import type { Request, RequestHandler } from "express";
import { asyncHandler } from "../http/async-handler";
import { logger } from "../lib/logger";
import type { OperationsRouteContext } from "./operations-route-context";

const MIN_DEBUG_ACCESS_TOKEN_LENGTH = 32;
const DEFAULT_DEBUG_ALLOWED_IPS = Object.freeze(["127.0.0.1", "::1"]);

export type OperationsDebugRouteStartupLock = Readonly<{
  enabled: boolean;
  requested: boolean;
  productionLike: boolean;
  reason: "enabled-local" | "disabled" | "production-like";
  accessToken: string | null;
  allowedIps: readonly string[];
}>;

export function isOperationsDebugRoutesEnabled(
  enabled: boolean,
  productionLike: boolean,
) {
  return enabled && !productionLike;
}

export function createOperationsDebugRouteStartupLock(params: {
  enabled?: boolean | undefined;
  productionLike?: boolean | undefined;
  accessToken?: string | null | undefined;
  allowedIps?: readonly string[] | undefined;
}): OperationsDebugRouteStartupLock {
  const requested = params.enabled === true;
  const productionLike = params.productionLike !== false;
  const enabled = isOperationsDebugRoutesEnabled(requested, productionLike);
  const accessToken = typeof params.accessToken === "string" ? params.accessToken : null;
  const allowedIps = normalizeDebugAllowedIps(params.allowedIps);
  const reason = enabled
    ? "enabled-local"
    : productionLike
      ? "production-like"
      : "disabled";

  if (enabled && (!accessToken || accessToken.length < MIN_DEBUG_ACCESS_TOKEN_LENGTH)) {
    throw new Error(
      `OPERATIONS_DEBUG_ACCESS_TOKEN must be set and at least ${MIN_DEBUG_ACCESS_TOKEN_LENGTH} characters when operations debug routes are enabled.`,
    );
  }

  return Object.freeze({
    enabled,
    requested,
    productionLike,
    reason,
    accessToken: enabled ? accessToken : null,
    allowedIps,
  });
}

function normalizeDebugIp(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return null;
  }

  if (normalized === "::1") {
    return "127.0.0.1";
  }

  if (normalized.startsWith("::ffff:")) {
    return normalized.slice("::ffff:".length);
  }

  return normalized;
}

function normalizeDebugAllowedIps(allowedIps: readonly string[] | undefined) {
  const normalized = (allowedIps && allowedIps.length > 0 ? allowedIps : DEFAULT_DEBUG_ALLOWED_IPS)
    .map(normalizeDebugIp)
    .filter((ip): ip is string => Boolean(ip));

  return Object.freeze(Array.from(new Set(normalized)));
}

function extractBearerToken(req: Request) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
}

function hasTimingSafeTokenMatch(token: string, expectedToken: string) {
  const expected = Buffer.from(expectedToken);
  const actualSource = Buffer.from(token);
  const actual = Buffer.alloc(expected.length);
  actualSource.copy(actual, 0, 0, Math.min(actualSource.length, actual.length));

  return timingSafeEqual(actual, expected) && actualSource.length === expected.length;
}

function isDebugIpAllowed(req: Request, allowedIps: readonly string[]) {
  const allowed = new Set(allowedIps.map(normalizeDebugIp).filter((ip): ip is string => Boolean(ip)));
  const candidates = [
    normalizeDebugIp(req.ip),
    normalizeDebugIp(req.socket.remoteAddress),
  ];

  return candidates.some((ip) => ip !== null && allowed.has(ip));
}

export function createOperationsDebugAccessGate(
  startupLock: OperationsDebugRouteStartupLock,
): RequestHandler {
  return (req, res, next) => {
    const token = extractBearerToken(req);
    const expectedToken = startupLock.accessToken || "";
    const tokenMatches = expectedToken.length > 0 && hasTimingSafeTokenMatch(token, expectedToken);
    const ipAllowed = isDebugIpAllowed(req, startupLock.allowedIps);

    if (!tokenMatches || !ipAllowed) {
      logger.warn("Operations debug route access rejected", {
        path: req.path,
        hasBearerToken: Boolean(token),
        ipAllowed,
      });
      res.status(404).json({ message: "Not found" });
      return;
    }

    logger.warn("Operations debug route accessed", {
      path: req.path,
    });
    next();
  };
}

export function registerOperationsDebugRoutes(
  context: OperationsRouteContext,
  startupLock: OperationsDebugRouteStartupLock,
) {
  if (!startupLock.enabled) {
    return;
  }

  const {
    app,
    operationsController,
    authenticateToken,
    requireRole,
  } = context;
  const debugAccessGate = createOperationsDebugAccessGate(startupLock);

  app.get(
    "/api/debug/websocket-clients",
    debugAccessGate,
    authenticateToken,
    requireRole("superuser"),
    asyncHandler(operationsController.getWebsocketClients),
  );
}

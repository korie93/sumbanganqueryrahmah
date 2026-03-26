import type { Request, RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { ERROR_CODES } from "../../shared/error-codes";

type RateLimitPayload = {
  ok: false;
  error: {
    code: string;
    message: string;
  };
};

export type AuthRouteRateLimiters = {
  login: RequestHandler;
  publicRecovery: RequestHandler;
  authenticatedAuth: RequestHandler;
  adminAction: RequestHandler;
};

type JsonRateLimiterOptions = {
  windowMs: number;
  max: number;
  code: string;
  message: string;
  keyGenerator?: (req: Request) => string;
};

type AuthenticatedLikeRequest = Request & {
  user?: {
    username?: string | null;
  };
};

function normalizeKeyPart(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized ? normalized.slice(0, 160) : null;
}

function buildRateLimitKey(req: Request, scope: string, ...parts: Array<unknown>): string {
  const keyParts = [scope, req.ip];
  for (const part of parts) {
    const normalized = normalizeKeyPart(part);
    if (normalized) {
      keyParts.push(normalized);
    }
  }
  return keyParts.join("|");
}

function createJsonRateLimiter(options: JsonRateLimiterOptions): RequestHandler {
  const payload: RateLimitPayload = {
    ok: false,
    error: {
      code: options.code,
      message: options.message,
    },
  };

  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: options.keyGenerator,
    handler: (_req, res) => {
      res.status(429).json(payload);
    },
  });
}

export const searchRateLimiter = createJsonRateLimiter({
  windowMs: 10 * 1000,
  max: 10,
  code: ERROR_CODES.SEARCH_RATE_LIMITED,
  message: "Too many search requests. Please slow down.",
});

export function createAuthRouteRateLimiters(): AuthRouteRateLimiters {
  return {
    login: createJsonRateLimiter({
      windowMs: 10 * 60 * 1000,
      max: 15,
      code: ERROR_CODES.AUTH_RATE_LIMITED,
      message: "Too many login attempts. Please try again shortly.",
      keyGenerator: (req) => buildRateLimitKey(req, "auth-login", req.body?.username),
    }),
    publicRecovery: createJsonRateLimiter({
      windowMs: 10 * 60 * 1000,
      max: 20,
      code: ERROR_CODES.AUTH_RECOVERY_RATE_LIMITED,
      message: "Too many activation or password reset attempts. Please try again shortly.",
      keyGenerator: (req) => buildRateLimitKey(
        req,
        `auth-recovery:${req.path}`,
        req.body?.identifier,
        req.body?.username,
        req.body?.email,
      ),
    }),
    authenticatedAuth: createJsonRateLimiter({
      windowMs: 10 * 60 * 1000,
      max: 12,
      code: ERROR_CODES.AUTH_MUTATION_RATE_LIMITED,
      message: "Too many account security updates. Please wait before trying again.",
      keyGenerator: (req) => {
        const authReq = req as AuthenticatedLikeRequest;
        return buildRateLimitKey(req, `auth-mutation:${req.path}`, authReq.user?.username);
      },
    }),
    adminAction: createJsonRateLimiter({
      windowMs: 10 * 60 * 1000,
      max: 30,
      code: ERROR_CODES.ADMIN_ACTION_RATE_LIMITED,
      message: "Too many admin account actions. Please slow down and try again.",
      keyGenerator: (req) => {
        const authReq = req as AuthenticatedLikeRequest;
        return buildRateLimitKey(req, `admin-action:${req.path}`, authReq.user?.username);
      },
    }),
  };
}

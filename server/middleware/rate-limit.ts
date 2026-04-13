import crypto from "node:crypto";
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
  loginIp: RequestHandler;
  login: RequestHandler;
  publicRecovery: RequestHandler;
  authenticatedAuth: RequestHandler;
  adminAction: RequestHandler;
  adminDestructiveAction: RequestHandler;
};

type JsonRateLimiterOptions = {
  windowMs: number;
  max: number;
  code: string;
  message: string;
  keyGenerator?: ((req: Request) => string) | undefined;
};

type AuthenticatedLikeRequest = Request & {
  user?: {
    username?: string | null;
  };
};

const AUTH_RATE_LIMIT_HASH_LENGTH = 24;

function normalizeKeyPart(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized ? normalized.slice(0, 160) : null;
}

export function normalizeAuthRateLimitIdentifier(value: unknown): string | null {
  return normalizeKeyPart(value);
}

export function buildAuthRouteRateLimitSubject(req: Request, scope: string): string | null {
  const body =
    req.body && typeof req.body === "object"
      ? req.body as Record<string, unknown>
      : null;
  if (!body) {
    return null;
  }

  const normalizedIdentifier = normalizeAuthRateLimitIdentifier(
    body.identifier ?? body.username ?? body.email,
  );
  if (!normalizedIdentifier) {
    return null;
  }

  const digest = crypto
    .createHash("sha256")
    .update(`${scope}:${normalizedIdentifier}`)
    .digest("hex")
    .slice(0, AUTH_RATE_LIMIT_HASH_LENGTH);

  return `acct:${digest}`;
}

export function buildRequestRateLimitFingerprint(req: Request): string[] {
  const parts: string[] = [normalizeKeyPart(req.ip) ?? "unknown"];
  const directPeer = normalizeKeyPart(req.socket?.remoteAddress);
  const userAgent = normalizeKeyPart(req.get("user-agent"));
  const acceptLanguage = normalizeKeyPart(req.get("accept-language"));

  if (directPeer && directPeer !== parts[0]) {
    parts.push(`peer:${directPeer}`);
  }

  if (userAgent) {
    parts.push(`ua:${userAgent}`);
  }

  if (acceptLanguage) {
    parts.push(`lang:${acceptLanguage}`);
  }

  return parts;
}

function buildRateLimitKey(req: Request, scope: string, ...parts: Array<unknown>): string {
  const keyParts = [scope, ...buildRequestRateLimitFingerprint(req)];
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
    ...(options.keyGenerator ? { keyGenerator: options.keyGenerator } : {}),
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

export function createImportsUploadRateLimiter(
  options: Partial<Pick<JsonRateLimiterOptions, "windowMs" | "max">> = {},
): RequestHandler {
  return createJsonRateLimiter({
    windowMs: options.windowMs ?? 5 * 60 * 1000,
    max: options.max ?? 12,
    code: ERROR_CODES.IMPORT_UPLOAD_RATE_LIMITED,
    message: "Too many import upload attempts from this network. Please wait before trying again.",
  });
}

export const importsUploadRateLimiter = createImportsUploadRateLimiter();

export function createAuthRouteRateLimiters(): AuthRouteRateLimiters {
  return {
    loginIp: createJsonRateLimiter({
      windowMs: 10 * 60 * 1000,
      max: 50,
      code: ERROR_CODES.AUTH_RATE_LIMITED,
      message: "Too many login attempts from this network. Please try again shortly.",
      keyGenerator: (req) => buildRateLimitKey(req, "auth-login-ip"),
    }),
    login: createJsonRateLimiter({
      windowMs: 10 * 60 * 1000,
      max: 15,
      code: ERROR_CODES.AUTH_RATE_LIMITED,
      message: "Too many login attempts. Please try again shortly.",
      keyGenerator: (req) => buildRateLimitKey(
        req,
        "auth-login",
        buildAuthRouteRateLimitSubject(req, "auth-login"),
      ),
    }),
    publicRecovery: createJsonRateLimiter({
      windowMs: 10 * 60 * 1000,
      max: 20,
      code: ERROR_CODES.AUTH_RECOVERY_RATE_LIMITED,
      message: "Too many activation or password reset attempts. Please try again shortly.",
      keyGenerator: (req) => buildRateLimitKey(
        req,
        `auth-recovery:${req.path}`,
        buildAuthRouteRateLimitSubject(req, `auth-recovery:${req.path}`),
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
    adminDestructiveAction: createJsonRateLimiter({
      windowMs: 10 * 60 * 1000,
      max: 10,
      code: ERROR_CODES.ADMIN_ACTION_RATE_LIMITED,
      message: "Too many destructive admin actions. Please slow down and try again.",
      keyGenerator: (req) => {
        const authReq = req as AuthenticatedLikeRequest;
        return buildRateLimitKey(req, `admin-destructive:${req.path}`, authReq.user?.username);
      },
    }),
  };
}

import crypto from "node:crypto";
import type { Request, RequestHandler, Response } from "express";
import rateLimit from "express-rate-limit";
import { ERROR_CODES } from "../../shared/error-codes";
import { runtimeConfig } from "../config/runtime";
import { createBackgroundSweepJob, type BackgroundSweepJob } from "../internal/background-sweep-job";
import { logger } from "../lib/logger";
import { createSharedRateLimitStore } from "./redis-rate-limit-store";

type RateLimitPayload = {
  ok: false;
  error: {
    code: string;
    message: string;
  };
  retryAfterMs?: number;
};

export type AuthRouteRateLimiters = {
  loginIp: RequestHandler;
  login: RequestHandler;
  twoFactorLogin: RequestHandler;
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
  adaptiveCooldown?: boolean | undefined;
  keyGenerator?: ((req: Request) => string) | undefined;
};

type StandardRateLimitHeaderOptions = {
  limit: number;
  remaining: number;
  retryAfterMs: number;
};

type AuthenticatedLikeRequest = Request & {
  user?: {
    username?: string | null;
  };
};

const AUTH_RATE_LIMIT_HASH_LENGTH = 24;
const ADAPTIVE_RATE_LIMIT_MAX_BUCKETS = 4_096;
const ADAPTIVE_RATE_LIMIT_MAX_COOLDOWN_MS = 60 * 60 * 1000;
const ADAPTIVE_RATE_LIMIT_SWEEP_INTERVAL_MS = 30_000;

type AdaptiveRateLimitBucket = {
  expiresAt: number;
  lastSeenAt: number;
  strikeCount: number;
};

const adaptiveRateLimitCooldowns = new Map<string, AdaptiveRateLimitBucket>();
let adaptiveRateLimitCooldownSweepJob: BackgroundSweepJob | null = null;

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

export function pruneAdaptiveRateLimitCooldowns(nowMs = Date.now()): number {
  let removedCount = 0;
  for (const [key, bucket] of adaptiveRateLimitCooldowns) {
    if (bucket.expiresAt <= nowMs) {
      adaptiveRateLimitCooldowns.delete(key);
      removedCount += 1;
    }
  }

  while (adaptiveRateLimitCooldowns.size > ADAPTIVE_RATE_LIMIT_MAX_BUCKETS) {
    const oldest = adaptiveRateLimitCooldowns.keys().next();
    if (oldest.done) {
      break;
    }
    adaptiveRateLimitCooldowns.delete(oldest.value);
    removedCount += 1;
  }

  return removedCount;
}

export function startAdaptiveRateLimitCooldownSweep(): () => void {
  if (adaptiveRateLimitCooldownSweepJob) {
    return stopAdaptiveRateLimitCooldownSweep;
  }

  adaptiveRateLimitCooldownSweepJob = createBackgroundSweepJob({
    failureMessage: "Auth adaptive rate-limit cooldown sweep failed",
    intervalMs: ADAPTIVE_RATE_LIMIT_SWEEP_INTERVAL_MS,
    logger,
    run: (nowMs) => {
      const removedCount = pruneAdaptiveRateLimitCooldowns(nowMs);
      if (removedCount > 0) {
        logger.debug("Pruned expired auth adaptive rate-limit cooldowns", {
          removedCount,
          remainingCount: adaptiveRateLimitCooldowns.size,
        });
      }
    },
  });
  return stopAdaptiveRateLimitCooldownSweep;
}

export function stopAdaptiveRateLimitCooldownSweep() {
  if (!adaptiveRateLimitCooldownSweepJob) {
    return;
  }
  adaptiveRateLimitCooldownSweepJob.stop();
  adaptiveRateLimitCooldownSweepJob = null;
}

export function getAdaptiveRateLimitCooldownStats() {
  return {
    bucketCount: adaptiveRateLimitCooldowns.size,
    sweepActive: adaptiveRateLimitCooldownSweepJob !== null,
  };
}

export function clearAdaptiveRateLimitCooldownsForTests() {
  adaptiveRateLimitCooldowns.clear();
}

export function getAdaptiveRateLimitCooldownKeysForTests(): string[] {
  return Array.from(adaptiveRateLimitCooldowns.keys());
}

function resolveJsonRateLimiterKey(req: Request, options: JsonRateLimiterOptions): string {
  return options.keyGenerator?.(req) ?? buildRateLimitKey(req, options.code);
}

function setStandardRateLimitHeaders(res: Response, options: StandardRateLimitHeaderOptions) {
  const resetSeconds = Math.max(1, Math.ceil(options.retryAfterMs / 1000));
  res.setHeader("RateLimit-Limit", String(Math.max(0, Math.trunc(options.limit))));
  res.setHeader("RateLimit-Remaining", String(Math.max(0, Math.trunc(options.remaining))));
  res.setHeader("RateLimit-Reset", String(resetSeconds));
  res.setHeader("Retry-After", String(resetSeconds));
}

function getAdaptiveRateLimitCooldown(key: string, nowMs: number): AdaptiveRateLimitBucket | null {
  const bucket = adaptiveRateLimitCooldowns.get(key);
  if (!bucket) {
    return null;
  }
  if (bucket.expiresAt <= nowMs) {
    adaptiveRateLimitCooldowns.delete(key);
    return null;
  }
  bucket.lastSeenAt = nowMs;
  adaptiveRateLimitCooldowns.delete(key);
  adaptiveRateLimitCooldowns.set(key, bucket);
  return bucket;
}

function recordAdaptiveRateLimitViolation(
  key: string,
  windowMs: number,
  nowMs: number,
): AdaptiveRateLimitBucket {
  const previous = getAdaptiveRateLimitCooldown(key, nowMs);
  const strikeCount = Math.min((previous?.strikeCount ?? 0) + 1, 8);
  const cooldownMs = Math.min(
    ADAPTIVE_RATE_LIMIT_MAX_COOLDOWN_MS,
    Math.max(windowMs, windowMs * (2 ** (strikeCount - 1))),
  );
  const bucket = {
    expiresAt: nowMs + cooldownMs,
    lastSeenAt: nowMs,
    strikeCount,
  };
  adaptiveRateLimitCooldowns.delete(key);
  adaptiveRateLimitCooldowns.set(key, bucket);
  // Keep the violation hot path bounded: expired-key lookup is handled above,
  // and Map insertion order provides O(1) LRU eviction for the global cap.
  pruneAdaptiveRateLimitCooldowns(nowMs);
  return bucket;
}

export function recordAdaptiveRateLimitViolationForTests(
  key: string,
  windowMs: number,
  nowMs: number,
): AdaptiveRateLimitBucket {
  return recordAdaptiveRateLimitViolation(key, windowMs, nowMs);
}

function createJsonRateLimiter(options: JsonRateLimiterOptions): RequestHandler {
  const payload: RateLimitPayload = {
    ok: false,
    error: {
      code: options.code,
      message: options.message,
    },
  };
  const sharedStore = createSharedRateLimitStore({
    config: runtimeConfig.rateLimiting.store,
    prefix: `sqr:rate-limit:${options.code}`,
  });

  const limiter = rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    ...(sharedStore ? { store: sharedStore } : {}),
    standardHeaders: true,
    legacyHeaders: false,
    ...(options.keyGenerator ? { keyGenerator: options.keyGenerator } : {}),
    handler: (req, res, _next, optionsUsed) => {
      const nowMs = Date.now();
      const cooldownBucket = options.adaptiveCooldown
        ? recordAdaptiveRateLimitViolation(resolveJsonRateLimiterKey(req, options), optionsUsed.windowMs, nowMs)
        : null;
      const rateLimitInfo = (req as Request & { rateLimit?: { resetTime?: Date } }).rateLimit;
      const resetTimeMs = rateLimitInfo?.resetTime instanceof Date
        ? rateLimitInfo.resetTime.getTime()
        : null;
      const baseRetryAfterMs = resetTimeMs
        ? Math.max(0, resetTimeMs - Date.now())
        : optionsUsed.windowMs;
      const retryAfterMs = Math.max(
        baseRetryAfterMs,
        cooldownBucket ? Math.max(0, cooldownBucket.expiresAt - nowMs) : 0,
      );

      logger.warn("Rate limit exceeded", {
        code: options.code,
        method: req.method,
        path: req.path,
        retryAfterMs,
        ...(cooldownBucket ? { strikeCount: cooldownBucket.strikeCount } : {}),
      });

      setStandardRateLimitHeaders(res, {
        limit: options.max,
        remaining: 0,
        retryAfterMs,
      });
      res.status(429).json({
        ...payload,
        retryAfterMs,
      });
    },
  });

  if (!options.adaptiveCooldown) {
    return limiter;
  }

  return (req, res, next) => {
    const nowMs = Date.now();
    const key = resolveJsonRateLimiterKey(req, options);
    const cooldownBucket = getAdaptiveRateLimitCooldown(key, nowMs);
    if (!cooldownBucket) {
      limiter(req, res, next);
      return;
    }

    const retryAfterMs = Math.max(0, cooldownBucket.expiresAt - nowMs);
    logger.warn("Rate limit adaptive cooldown active", {
      code: options.code,
      method: req.method,
      path: req.path,
      retryAfterMs,
      strikeCount: cooldownBucket.strikeCount,
    });
    setStandardRateLimitHeaders(res, {
      limit: options.max,
      remaining: 0,
      retryAfterMs,
    });
    res.status(429).json({
      ...payload,
      retryAfterMs,
    });
  };
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
  startAdaptiveRateLimitCooldownSweep();
  return {
    loginIp: createJsonRateLimiter({
      windowMs: 15 * 60 * 1000,
      max: 5,
      code: ERROR_CODES.AUTH_RATE_LIMITED,
      message: "Too many login attempts from this network. Please try again shortly.",
      adaptiveCooldown: true,
      keyGenerator: (req) => buildRateLimitKey(req, "auth-login-ip"),
    }),
    login: createJsonRateLimiter({
      windowMs: 15 * 60 * 1000,
      max: 5,
      code: ERROR_CODES.AUTH_RATE_LIMITED,
      message: "Too many login attempts. Please try again shortly.",
      adaptiveCooldown: true,
      keyGenerator: (req) => buildRateLimitKey(
        req,
        "auth-login",
        buildAuthRouteRateLimitSubject(req, "auth-login"),
      ),
    }),
    twoFactorLogin: createJsonRateLimiter({
      windowMs: 15 * 60 * 1000,
      max: 5,
      code: ERROR_CODES.AUTH_RATE_LIMITED,
      message: "Too many authenticator code attempts. Please try again shortly.",
      adaptiveCooldown: true,
      keyGenerator: (req) => buildRateLimitKey(req, "auth-login-2fa"),
    }),
    publicRecovery: createJsonRateLimiter({
      windowMs: 10 * 60 * 1000,
      max: 20,
      code: ERROR_CODES.AUTH_RECOVERY_RATE_LIMITED,
      message: "Too many activation or password reset attempts. Please try again shortly.",
      adaptiveCooldown: true,
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

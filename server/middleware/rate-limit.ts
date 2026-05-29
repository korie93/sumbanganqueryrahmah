import crypto from "node:crypto";
import type { Request, RequestHandler, Response } from "express";
import rateLimit from "express-rate-limit";
import { LRUCache } from "lru-cache";
import { ERROR_CODES } from "../../shared/error-codes";
import { runtimeConfig } from "../config/runtime";
import { createBackgroundSweepJob, type BackgroundSweepJob } from "../internal/background-sweep-job";
import { internalMetrics } from "../internal/metrics";
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
const ADAPTIVE_RATE_LIMIT_CACHE_PRESSURE_THRESHOLD_RATIO = 0.85;
const ADAPTIVE_RATE_LIMIT_CACHE_PRESSURE_LOG_INTERVAL_MS = 60_000;
const ADAPTIVE_RATE_LIMIT_WARNING_EVICTION_BATCH_SIZE = 512;

const ADAPTIVE_RATE_LIMIT_CACHE_PRESSURE_TIERS = {
  NORMAL: { threshold: 0, severity: 0 },
  WARNING: { threshold: 0.85, severity: 1 },
  CRITICAL: { threshold: 0.95, severity: 2 },
  EMERGENCY: { threshold: 1, severity: 3 },
} as const;

export type AdaptiveRateLimitCachePressureTier =
  keyof typeof ADAPTIVE_RATE_LIMIT_CACHE_PRESSURE_TIERS;

type AdaptiveRateLimitEvictionResult = {
  evictedCount: number;
  tier: AdaptiveRateLimitCachePressureTier;
  timestamp: number;
};

type AdaptiveRateLimitBucket = {
  expiresAt: number;
  lastSeenAt: number;
  strikeCount: number;
};

const adaptiveRateLimitCooldowns = new LRUCache<string, AdaptiveRateLimitBucket>({
  allowStale: false,
  max: ADAPTIVE_RATE_LIMIT_MAX_BUCKETS,
  ttl: ADAPTIVE_RATE_LIMIT_MAX_COOLDOWN_MS,
  ttlAutopurge: false,
  updateAgeOnGet: false,
});
let adaptiveRateLimitCooldownSweepJob: BackgroundSweepJob | null = null;
let adaptiveRateLimitCachePressureLastLoggedAt = 0;
let adaptiveRateLimitWarningEvictionLastRanAt = 0;

function recordAdaptiveRateLimitCooldownCacheGauges(): void {
  internalMetrics.gauge(
    "authAdaptiveRateLimitCooldownCacheSize",
    adaptiveRateLimitCooldowns.size,
  );
  internalMetrics.gauge(
    "authAdaptiveRateLimitCooldownCacheUtilization",
    adaptiveRateLimitCooldowns.size / ADAPTIVE_RATE_LIMIT_MAX_BUCKETS,
  );
}

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

  for (const key of Array.from(adaptiveRateLimitCooldowns.keys())) {
    const bucket = adaptiveRateLimitCooldowns.peek(key);
    if (!bucket || bucket.expiresAt <= nowMs) {
      if (adaptiveRateLimitCooldowns.delete(key)) {
        removedCount += 1;
      }
    }
  }

  if (removedCount > 0) {
    recordAdaptiveRateLimitCooldownCacheGauges();
  }

  return removedCount;
}

export function getAdaptiveRateLimitCachePressureTier(
  currentSize: number,
  maxSize = ADAPTIVE_RATE_LIMIT_MAX_BUCKETS,
): AdaptiveRateLimitCachePressureTier {
  if (maxSize <= 0) {
    return "EMERGENCY";
  }

  const utilization = currentSize / maxSize;
  if (utilization >= ADAPTIVE_RATE_LIMIT_CACHE_PRESSURE_TIERS.EMERGENCY.threshold) {
    return "EMERGENCY";
  }
  if (utilization >= ADAPTIVE_RATE_LIMIT_CACHE_PRESSURE_TIERS.CRITICAL.threshold) {
    return "CRITICAL";
  }
  if (utilization >= ADAPTIVE_RATE_LIMIT_CACHE_PRESSURE_TIERS.WARNING.threshold) {
    return "WARNING";
  }
  return "NORMAL";
}

function deleteOldestAdaptiveRateLimitCooldowns(targetEvictCount: number): number {
  let evictedCount = 0;
  for (const key of adaptiveRateLimitCooldowns.rkeys()) {
    if (evictedCount >= targetEvictCount) {
      break;
    }
    if (adaptiveRateLimitCooldowns.delete(key)) {
      evictedCount += 1;
    }
  }
  return evictedCount;
}

function performAdaptiveRateLimitCachePressureEviction(
  tier: AdaptiveRateLimitCachePressureTier,
  nowMs: number,
): AdaptiveRateLimitEvictionResult {
  let evictedCount = 0;

  if (tier === "WARNING") {
    for (const key of adaptiveRateLimitCooldowns.rkeys()) {
      if (evictedCount >= ADAPTIVE_RATE_LIMIT_WARNING_EVICTION_BATCH_SIZE) {
        break;
      }

      const bucket = adaptiveRateLimitCooldowns.peek(key);
      if (!bucket || bucket.expiresAt <= nowMs) {
        if (adaptiveRateLimitCooldowns.delete(key)) {
          evictedCount += 1;
        }
      }
    }
  } else if (tier === "CRITICAL") {
    evictedCount = deleteOldestAdaptiveRateLimitCooldowns(
      Math.max(1, Math.floor(adaptiveRateLimitCooldowns.size * 0.2)),
    );
  } else if (tier === "EMERGENCY") {
    evictedCount = deleteOldestAdaptiveRateLimitCooldowns(
      Math.max(1, Math.floor(adaptiveRateLimitCooldowns.size * 0.5)),
    );
  }

  if (evictedCount > 0) {
    internalMetrics.increment("authAdaptiveRateLimitCooldownEvictionsTotal", evictedCount);
    recordAdaptiveRateLimitCooldownCacheGauges();
  }

  return {
    evictedCount,
    tier,
    timestamp: nowMs,
  };
}

export function performAdaptiveRateLimitCachePressureEvictionForTests(
  tier: AdaptiveRateLimitCachePressureTier,
  nowMs: number,
): AdaptiveRateLimitEvictionResult {
  return performAdaptiveRateLimitCachePressureEviction(tier, nowMs);
}

function maybeEvictAdaptiveRateLimitCooldownsForPressure(nowMs: number): void {
  const tier = getAdaptiveRateLimitCachePressureTier(adaptiveRateLimitCooldowns.size);
  if (tier === "NORMAL") {
    return;
  }

  if (
    tier === "WARNING"
    && adaptiveRateLimitWarningEvictionLastRanAt > 0
    && nowMs - adaptiveRateLimitWarningEvictionLastRanAt
      < ADAPTIVE_RATE_LIMIT_CACHE_PRESSURE_LOG_INTERVAL_MS
  ) {
    return;
  }

  const sizeBefore = adaptiveRateLimitCooldowns.size;
  const result = performAdaptiveRateLimitCachePressureEviction(tier, nowMs);
  if (tier === "WARNING") {
    adaptiveRateLimitWarningEvictionLastRanAt = nowMs;
  }

  if (result.evictedCount === 0 && tier === "WARNING") {
    return;
  }

  const logPayload = {
    evictedCount: result.evictedCount,
    maxBuckets: ADAPTIVE_RATE_LIMIT_MAX_BUCKETS,
    sizeAfter: adaptiveRateLimitCooldowns.size,
    sizeBefore,
    tier,
  };
  if (tier === "EMERGENCY") {
    logger.error("Auth adaptive rate-limit cooldown cache emergency eviction activated", logPayload);
    return;
  }

  logger.warn("Auth adaptive rate-limit cooldown cache pressure eviction performed", logPayload);
}

function maybeReportAdaptiveRateLimitCachePressure(nowMs: number) {
  const bucketCount = adaptiveRateLimitCooldowns.size;
  const pressureThreshold = Math.ceil(
    ADAPTIVE_RATE_LIMIT_MAX_BUCKETS * ADAPTIVE_RATE_LIMIT_CACHE_PRESSURE_THRESHOLD_RATIO,
  );
  if (bucketCount < pressureThreshold) {
    return;
  }

  if (
    adaptiveRateLimitCachePressureLastLoggedAt > 0
    && nowMs - adaptiveRateLimitCachePressureLastLoggedAt
      < ADAPTIVE_RATE_LIMIT_CACHE_PRESSURE_LOG_INTERVAL_MS
  ) {
    return;
  }

  adaptiveRateLimitCachePressureLastLoggedAt = nowMs;
  internalMetrics.increment("authAdaptiveRateLimitCooldownCachePressureTotal");
  logger.warn("Auth adaptive rate-limit cooldown cache pressure detected", {
    bucketCount,
    maxBuckets: ADAPTIVE_RATE_LIMIT_MAX_BUCKETS,
    thresholdPercent: Math.round(ADAPTIVE_RATE_LIMIT_CACHE_PRESSURE_THRESHOLD_RATIO * 100),
    utilizationPercent: Math.round((bucketCount / ADAPTIVE_RATE_LIMIT_MAX_BUCKETS) * 100),
  });
}

function setAdaptiveRateLimitCooldown(
  key: string,
  bucket: AdaptiveRateLimitBucket,
  nowMs: number,
) {
  maybeEvictAdaptiveRateLimitCooldownsForPressure(nowMs);
  const ttlMs = Math.max(1, bucket.expiresAt - nowMs);
  adaptiveRateLimitCooldowns.set(key, bucket, { ttl: ttlMs });
  recordAdaptiveRateLimitCooldownCacheGauges();
  maybeReportAdaptiveRateLimitCachePressure(nowMs);
}

function deleteAdaptiveRateLimitCooldown(key: string): boolean {
  const deleted = adaptiveRateLimitCooldowns.delete(key);
  if (deleted) {
    recordAdaptiveRateLimitCooldownCacheGauges();
  }
  return deleted;
}

function clearAdaptiveRateLimitCooldownState() {
  adaptiveRateLimitCooldowns.clear();
  adaptiveRateLimitCachePressureLastLoggedAt = 0;
  adaptiveRateLimitWarningEvictionLastRanAt = 0;
  recordAdaptiveRateLimitCooldownCacheGauges();
}

function getAdaptiveRateLimitCooldownKeys(): string[] {
  return Array.from(adaptiveRateLimitCooldowns.keys());
}

function getAdaptiveRateLimitCooldownBucket(key: string): AdaptiveRateLimitBucket | null {
  return adaptiveRateLimitCooldowns.get(key) ?? null;
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
  clearAdaptiveRateLimitCooldownState();
}

export function getAdaptiveRateLimitCooldownKeysForTests(): string[] {
  return getAdaptiveRateLimitCooldownKeys();
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
  const bucket = getAdaptiveRateLimitCooldownBucket(key);
  if (!bucket) {
    return null;
  }
  if (bucket.expiresAt <= nowMs) {
    deleteAdaptiveRateLimitCooldown(key);
    return null;
  }
  bucket.lastSeenAt = nowMs;
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
  setAdaptiveRateLimitCooldown(key, bucket, nowMs);
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

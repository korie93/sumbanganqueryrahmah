import crypto from "node:crypto";
import type { Request, RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { ERROR_CODES } from "../../shared/error-codes";
import { applyLegacyRateLimitHeaders } from "../http/rate-limit-headers";
import { resolveRetryAfterHeaderValue } from "../http/retry-after";

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
    activityId?: string | null;
    id?: string | null;
    userId?: string | null;
    username?: string | null;
  };
};

type RateLimitedRequest = Request & {
  rateLimit?: {
    limit?: number | undefined;
    remaining?: number | undefined;
    resetTime?: Date | undefined;
  };
};

const AUTH_RATE_LIMIT_HASH_LENGTH = 24;
const RATE_LIMIT_KEY_ADMISSION_TTL_MS = 15 * 60 * 1000;
const RATE_LIMIT_KEY_ADMISSION_MAX_BUCKETS = 2_048;
const RATE_LIMIT_KEY_ADMISSION_MAX_SUFFIXES_PER_BUCKET = 32;
const RATE_LIMIT_OVERFLOW_BUCKET_SUFFIX = "overflow";

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

function buildRequestRateLimitNetworkIdentity(req: Request): string[] {
  const parts: string[] = [normalizeKeyPart(req.ip) ?? "unknown"];
  const directPeer = normalizeKeyPart(req.socket?.remoteAddress);

  if (directPeer && directPeer !== parts[0]) {
    parts.push(`peer:${directPeer}`);
  }

  return parts;
}

type RateLimitKeyAdmissionControllerOptions = {
  maxBuckets?: number;
  maxSuffixesPerBucket?: number;
  now?: () => number;
  ttlMs?: number;
};

type RateLimitKeyAdmissionBucket = {
  lastSeenAt: number;
  suffixes: Map<string, number>;
};

export function createRateLimitKeyAdmissionController(
  options: RateLimitKeyAdmissionControllerOptions = {},
) {
  const buckets = new Map<string, RateLimitKeyAdmissionBucket>();
  const maxBuckets = options.maxBuckets ?? RATE_LIMIT_KEY_ADMISSION_MAX_BUCKETS;
  const maxSuffixesPerBucket = options.maxSuffixesPerBucket ?? RATE_LIMIT_KEY_ADMISSION_MAX_SUFFIXES_PER_BUCKET;
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? RATE_LIMIT_KEY_ADMISSION_TTL_MS;

  const pruneExpiredBuckets = (observedAt: number) => {
    for (const [bucketKey, bucket] of buckets.entries()) {
      if (observedAt - bucket.lastSeenAt < ttlMs) {
        continue;
      }

      buckets.delete(bucketKey);
    }
  };

  const pruneExpiredSuffixes = (bucket: RateLimitKeyAdmissionBucket, observedAt: number) => {
    for (const [suffix, lastSeenAt] of bucket.suffixes.entries()) {
      if (observedAt - lastSeenAt < ttlMs) {
        continue;
      }

      bucket.suffixes.delete(suffix);
    }
  };

  const pruneOverflowBuckets = () => {
    while (buckets.size > maxBuckets) {
      const oldestBucketKey = buckets.keys().next().value;
      if (!oldestBucketKey) {
        break;
      }
      buckets.delete(oldestBucketKey);
    }
  };

  return {
    admit(bucketKey: string, suffix: string) {
      const normalizedBucketKey = String(bucketKey || "").trim();
      const normalizedSuffix = String(suffix || "").trim();
      if (!normalizedBucketKey || !normalizedSuffix) {
        return RATE_LIMIT_OVERFLOW_BUCKET_SUFFIX;
      }

      const observedAt = now();
      pruneExpiredBuckets(observedAt);

      const existingBucket = buckets.get(normalizedBucketKey);
      if (!existingBucket && buckets.size >= maxBuckets) {
        return RATE_LIMIT_OVERFLOW_BUCKET_SUFFIX;
      }
      const bucket = existingBucket ?? {
        lastSeenAt: observedAt,
        suffixes: new Map<string, number>(),
      };

      if (existingBucket) {
        buckets.delete(normalizedBucketKey);
      }

      bucket.lastSeenAt = observedAt;
      pruneExpiredSuffixes(bucket, observedAt);

      const existingSuffixSeenAt = bucket.suffixes.get(normalizedSuffix);
      if (existingSuffixSeenAt != null) {
        bucket.suffixes.delete(normalizedSuffix);
        bucket.suffixes.set(normalizedSuffix, observedAt);
        buckets.set(normalizedBucketKey, bucket);
        return normalizedSuffix;
      }

      if (bucket.suffixes.size < maxSuffixesPerBucket) {
        bucket.suffixes.set(normalizedSuffix, observedAt);
        buckets.set(normalizedBucketKey, bucket);
        pruneOverflowBuckets();
        return normalizedSuffix;
      }

      buckets.set(normalizedBucketKey, bucket);
      pruneOverflowBuckets();
      return RATE_LIMIT_OVERFLOW_BUCKET_SUFFIX;
    },
    clear() {
      buckets.clear();
    },
  };
}

const rateLimitKeyAdmissionController = createRateLimitKeyAdmissionController();

function buildRateLimitKey(req: Request, scope: string, ...parts: Array<unknown>): string {
  const keyParts = [scope, ...buildRequestRateLimitNetworkIdentity(req)];
  for (const part of parts) {
    const normalized = normalizeKeyPart(part);
    if (normalized) {
      keyParts.push(normalized);
    }
  }
  return keyParts.join("|");
}

function buildBoundedRateLimitKey(req: Request, scope: string, subject: unknown): string {
  const baseKey = buildRateLimitKey(req, scope);
  const normalizedSubject = normalizeKeyPart(subject);
  if (!normalizedSubject) {
    return baseKey;
  }

  const admittedSubjectSuffix = rateLimitKeyAdmissionController.admit(baseKey, normalizedSubject);
  return `${baseKey}|${admittedSubjectSuffix}`;
}

export function resolveAuthenticatedRateLimitSubject(req: AuthenticatedLikeRequest): string | null {
  return normalizeKeyPart(
    req.user?.userId
      ?? req.user?.id
      ?? req.user?.username
      ?? req.user?.activityId,
  );
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
    handler: (req, res) => {
      applyLegacyRateLimitHeaders(res, {
        limit: (req as RateLimitedRequest).rateLimit?.limit ?? options.max,
        remaining: (req as RateLimitedRequest).rateLimit?.remaining ?? 0,
        resetTime: (req as RateLimitedRequest).rateLimit?.resetTime,
      });
      res.setHeader("Retry-After", resolveRetryAfterHeaderValue({
        windowMs: options.windowMs,
        ...((req as RateLimitedRequest).rateLimit?.resetTime
          ? { resetTime: (req as RateLimitedRequest).rateLimit?.resetTime }
          : {}),
      }));
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
      keyGenerator: (req) => buildBoundedRateLimitKey(
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
      keyGenerator: (req) => buildBoundedRateLimitKey(
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
        return buildBoundedRateLimitKey(
          req,
          `auth-mutation:${req.path}`,
          resolveAuthenticatedRateLimitSubject(authReq),
        );
      },
    }),
    adminAction: createJsonRateLimiter({
      windowMs: 10 * 60 * 1000,
      max: 30,
      code: ERROR_CODES.ADMIN_ACTION_RATE_LIMITED,
      message: "Too many admin account actions. Please slow down and try again.",
      keyGenerator: (req) => {
        const authReq = req as AuthenticatedLikeRequest;
        return buildBoundedRateLimitKey(
          req,
          `admin-action:${req.path}`,
          resolveAuthenticatedRateLimitSubject(authReq),
        );
      },
    }),
    adminDestructiveAction: createJsonRateLimiter({
      windowMs: 10 * 60 * 1000,
      max: 10,
      code: ERROR_CODES.ADMIN_ACTION_RATE_LIMITED,
      message: "Too many destructive admin actions. Please slow down and try again.",
      keyGenerator: (req) => {
        const authReq = req as AuthenticatedLikeRequest;
        return buildBoundedRateLimitKey(
          req,
          `admin-destructive:${req.path}`,
          resolveAuthenticatedRateLimitSubject(authReq),
        );
      },
    }),
  };
}

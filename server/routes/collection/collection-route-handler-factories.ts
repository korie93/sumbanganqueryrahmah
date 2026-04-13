import type { RequestHandler, Response } from "express";
import type { AuthenticatedRequest } from "../../auth/guards";
import { runtimeConfig } from "../../config/runtime";
import { badRequest, HttpError } from "../../http/errors";
import { logger } from "../../lib/logger";
import type {
  PostgresStorage,
} from "../../storage-postgres";

export type CollectionJsonRouteHandler = (req: AuthenticatedRequest) => Promise<unknown>;
export type CollectionMutationScopeResolver = (req: AuthenticatedRequest) => string;

type CollectionMutationIdempotencyStorage = Pick<
  PostgresStorage,
  "acquireMutationIdempotency" | "completeMutationIdempotency" | "releaseMutationIdempotency"
>;

const SLOW_COLLECTION_ROUTE_THRESHOLD_MS = Math.max(
  250,
  runtimeConfig.collection.routeWarnMs,
);
const OBSERVED_COLLECTION_ROUTE_PATHS = new Set([
  "/api/collection/summary",
  "/api/collection/list",
  "/api/collection/nickname-summary",
  "/api/collection/daily/overview",
  "/api/collection/daily/day-details",
]);
const IDEMPOTENCY_FINGERPRINT_PARSE_CACHE_LIMIT = 256;
const IDEMPOTENCY_FINGERPRINT_PARSE_CACHE_TTL_MS = 5 * 60 * 1000;
const IDEMPOTENCY_FINGERPRINT_PARSE_CACHE_SWEEP_INTERVAL_MS = 60 * 1000;
type IdempotencyFingerprintValidationCacheEntry = {
  lastValidatedAt: number;
};

type IdempotencyFingerprintValidationCacheController = {
  cache: Map<string, IdempotencyFingerprintValidationCacheEntry>;
  clear: () => void;
  get: (key: string) => IdempotencyFingerprintValidationCacheEntry | undefined;
  set: (key: string, entry: IdempotencyFingerprintValidationCacheEntry) => void;
};

type CreateIdempotencyFingerprintValidationCacheControllerOptions = {
  clearIntervalFn?: typeof clearInterval;
  limit?: number;
  now?: () => number;
  setIntervalFn?: typeof setInterval;
  sweepIntervalMs?: number;
  ttlMs?: number;
};

export function pruneIdempotencyFingerprintValidationCache(
  cache: Map<string, IdempotencyFingerprintValidationCacheEntry>,
  limit = IDEMPOTENCY_FINGERPRINT_PARSE_CACHE_LIMIT,
): number {
  if (cache.size <= limit) {
    return 0;
  }

  const pruneCount = cache.size - limit;
  let removed = 0;

  for (const key of cache.keys()) {
    cache.delete(key);
    removed += 1;
    if (removed >= pruneCount) {
      break;
    }
  }

  return removed;
}

export function pruneExpiredIdempotencyFingerprintValidationCache(
  cache: Map<string, IdempotencyFingerprintValidationCacheEntry>,
  options?: {
    now?: number;
    ttlMs?: number;
  },
): number {
  const now = options?.now ?? Date.now();
  const ttlMs = options?.ttlMs ?? IDEMPOTENCY_FINGERPRINT_PARSE_CACHE_TTL_MS;
  let removed = 0;

  for (const [key, entry] of cache.entries()) {
    if (now - entry.lastValidatedAt < ttlMs) {
      continue;
    }

    cache.delete(key);
    removed += 1;
  }

  return removed;
}

export function createIdempotencyFingerprintValidationCacheController(
  options: CreateIdempotencyFingerprintValidationCacheControllerOptions = {},
): IdempotencyFingerprintValidationCacheController {
  const cache = new Map<string, IdempotencyFingerprintValidationCacheEntry>();
  const now = options.now ?? Date.now;
  const limit = options.limit ?? IDEMPOTENCY_FINGERPRINT_PARSE_CACHE_LIMIT;
  const ttlMs = options.ttlMs ?? IDEMPOTENCY_FINGERPRINT_PARSE_CACHE_TTL_MS;
  const sweepIntervalMs = options.sweepIntervalMs ?? IDEMPOTENCY_FINGERPRINT_PARSE_CACHE_SWEEP_INTERVAL_MS;
  const setIntervalFn = options.setIntervalFn ?? setInterval;
  const clearIntervalFn = options.clearIntervalFn ?? clearInterval;
  let sweepHandle: ReturnType<typeof setInterval> | null = null;

  function stopSweepTimer() {
    if (!sweepHandle) {
      return;
    }

    clearIntervalFn(sweepHandle);
    sweepHandle = null;
  }

  function sweepExpiredEntries() {
    pruneExpiredIdempotencyFingerprintValidationCache(cache, {
      now: now(),
      ttlMs,
    });

    if (cache.size === 0) {
      stopSweepTimer();
    }
  }

  function ensureSweepTimer() {
    if (sweepHandle || cache.size === 0) {
      return;
    }

    sweepHandle = setIntervalFn(sweepExpiredEntries, sweepIntervalMs);
    sweepHandle.unref?.();
  }

  function clear() {
    cache.clear();
    stopSweepTimer();
  }

  function get(key: string) {
    const entry = cache.get(key);
    if (!entry) {
      return undefined;
    }

    if (now() - entry.lastValidatedAt >= ttlMs) {
      cache.delete(key);
      if (cache.size === 0) {
        stopSweepTimer();
      }
      return undefined;
    }

    cache.delete(key);
    cache.set(key, entry);
    ensureSweepTimer();
    return entry;
  }

  function set(key: string, entry: IdempotencyFingerprintValidationCacheEntry) {
    pruneExpiredIdempotencyFingerprintValidationCache(cache, {
      now: now(),
      ttlMs,
    });

    cache.delete(key);
    cache.set(key, entry);
    pruneIdempotencyFingerprintValidationCache(cache, limit);
    ensureSweepTimer();
  }

  return {
    cache,
    clear,
    get,
    set,
  };
}

const idempotencyFingerprintValidationCacheController =
  createIdempotencyFingerprintValidationCacheController();

function sendCollectionError(res: Response, err: unknown, fallbackMessage: string) {
  if (err instanceof HttpError) {
    const message = err.expose ? err.message : fallbackMessage;
    return res.status(err.statusCode).json({
      ok: false,
      message,
      ...(err.expose && err.code ? { error: { code: err.code, message } } : {}),
    });
  }

  logger.error("Unhandled collection route error", {
    message: (err as { message?: string })?.message,
  });
  return res.status(500).json({ ok: false, message: fallbackMessage });
}

function logSlowCollectionRoute(req: AuthenticatedRequest, elapsedMs: number, statusCode: number) {
  if (!OBSERVED_COLLECTION_ROUTE_PATHS.has(req.path)) {
    return;
  }
  if (elapsedMs < SLOW_COLLECTION_ROUTE_THRESHOLD_MS) {
    return;
  }

  logger.warn("Collection route latency threshold exceeded", {
    method: req.method,
    path: req.path,
    statusCode,
    elapsedMs: Number(elapsedMs.toFixed(2)),
    username: req.user?.username || null,
  });
}

function normalizeIdempotencyHeaderValue(value: unknown, options?: { maxLength?: number }): string | null {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return null;
  }

  const maxLength = options?.maxLength ?? 512;
  if (normalized.length > maxLength) {
    throw badRequest(`Idempotency header exceeds the ${maxLength}-character limit.`);
  }

  return normalized;
}

export function normalizeIdempotencyFingerprintHeaderValue(value: unknown): string | null {
  const normalized = normalizeIdempotencyHeaderValue(value, { maxLength: 512 });
  if (!normalized) {
    return null;
  }

  const now = Date.now();
  const cached = idempotencyFingerprintValidationCacheController.get(normalized);

  if (!cached) {
    try {
      JSON.parse(normalized);
    } catch {
      throw badRequest("Idempotency fingerprint must be valid JSON.");
    }

    idempotencyFingerprintValidationCacheController.set(normalized, { lastValidatedAt: now });
  } else {
    cached.lastValidatedAt = now;
    idempotencyFingerprintValidationCacheController.set(normalized, cached);
  }

  return normalized;
}

export function clearIdempotencyFingerprintValidationCacheForTests() {
  idempotencyFingerprintValidationCacheController.clear();
}

function normalizeMutationResponseBody(payload: unknown): unknown {
  if (payload === undefined) {
    return null;
  }

  return payload;
}

async function reserveCollectionMutationIdempotency(params: {
  req: AuthenticatedRequest;
  storage: CollectionMutationIdempotencyStorage;
  scopeResolver: CollectionMutationScopeResolver;
}) {
  const { req, storage, scopeResolver } = params;
  const idempotencyKey = normalizeIdempotencyHeaderValue(req.header("x-idempotency-key"));
  const requestFingerprint = normalizeIdempotencyFingerprintHeaderValue(
    req.header("x-idempotency-fingerprint"),
  );

  if (!idempotencyKey || !req.user?.username) {
    return {
      actor: null,
      key: idempotencyKey,
      reserved: false,
      response: null,
      scope: null,
    };
  }

  const scope = normalizeIdempotencyHeaderValue(scopeResolver(req), {
    maxLength: 512,
  });
  if (!scope) {
    return {
      actor: req.user.username,
      key: idempotencyKey,
      reserved: false,
      response: null,
      scope: null,
    };
  }

  const reservation = await storage.acquireMutationIdempotency({
    scope,
    actor: req.user.username,
    idempotencyKey,
    requestFingerprint,
  });

  if (reservation.status === "replay") {
    return {
      actor: req.user.username,
      key: idempotencyKey,
      reserved: false,
      response: {
        body: reservation.responseBody,
        status: reservation.responseStatus,
      },
      scope,
    };
  }

  if (reservation.status === "payload_mismatch") {
    return {
      actor: req.user.username,
      key: idempotencyKey,
      reserved: false,
      response: {
        body: {
          ok: false,
          message: "This request key was already used for a different collection mutation payload.",
          error: {
            code: "IDEMPOTENCY_KEY_PAYLOAD_MISMATCH",
            message: "This request key was already used for a different collection mutation payload.",
          },
        },
        status: 409,
      },
      scope,
    };
  }

  if (reservation.status === "in_progress") {
    return {
      actor: req.user.username,
      key: idempotencyKey,
      reserved: false,
      response: {
        body: {
          ok: false,
          message: "A matching collection mutation is still being processed. Please wait and refresh before retrying.",
          error: {
            code: "IDEMPOTENCY_KEY_IN_PROGRESS",
            message: "A matching collection mutation is still being processed. Please wait and refresh before retrying.",
          },
        },
        status: 409,
      },
      scope,
    };
  }

  return {
    actor: req.user.username,
    key: idempotencyKey,
    reserved: true,
    response: null,
    scope,
  };
}

export function createCollectionJsonRouteHandler(params: {
  fallbackMessage: string;
  handler: CollectionJsonRouteHandler;
}): RequestHandler {
  const { fallbackMessage, handler } = params;

  return async (req, res) => {
    const startedAt = process.hrtime.bigint();
    try {
      return res.json(await handler(req as AuthenticatedRequest));
    } catch (err) {
      return sendCollectionError(res, err, fallbackMessage);
    } finally {
      const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      logSlowCollectionRoute(req as AuthenticatedRequest, elapsedMs, Number(res.statusCode || 0));
    }
  };
}

export function createCollectionJsonMutationRouteHandler(params: {
  fallbackMessage: string;
  handler: CollectionJsonRouteHandler;
  scopeResolver: CollectionMutationScopeResolver;
  storage: CollectionMutationIdempotencyStorage;
}): RequestHandler {
  const { fallbackMessage, handler, scopeResolver, storage } = params;

  return async (req, res) => {
    const startedAt = process.hrtime.bigint();
    let reservation: Awaited<ReturnType<typeof reserveCollectionMutationIdempotency>> | null = null;

    try {
      const authenticatedReq = req as AuthenticatedRequest;
      reservation = await reserveCollectionMutationIdempotency({
        req: authenticatedReq,
        scopeResolver,
        storage,
      });

      if (reservation.response) {
        return res.status(reservation.response.status).json(reservation.response.body);
      }

      const payload = await handler(authenticatedReq);
      const serializablePayload = normalizeMutationResponseBody(payload);

      if (reservation.reserved && reservation.scope && reservation.actor && reservation.key) {
        try {
          await storage.completeMutationIdempotency({
            scope: reservation.scope,
            actor: reservation.actor,
            idempotencyKey: reservation.key,
            responseStatus: 200,
            responseBody: serializablePayload,
          });
        } catch (error) {
          logger.warn("Failed to persist collection mutation idempotency response", {
            error,
            scope: reservation.scope,
            actor: reservation.actor,
          });
          try {
            await storage.releaseMutationIdempotency({
              scope: reservation.scope,
              actor: reservation.actor,
              idempotencyKey: reservation.key,
            });
          } catch (releaseError) {
            logger.warn("Failed to release collection mutation idempotency reservation after persist failure", {
              error: releaseError,
              scope: reservation.scope,
              actor: reservation.actor,
            });
          }
        }
      }

      return res.json(serializablePayload);
    } catch (err) {
      if (reservation?.reserved && reservation.scope && reservation.actor && reservation.key) {
        try {
          await storage.releaseMutationIdempotency({
            scope: reservation.scope,
            actor: reservation.actor,
            idempotencyKey: reservation.key,
          });
        } catch (releaseError) {
          logger.warn("Failed to release collection mutation idempotency reservation", {
            error: releaseError,
            scope: reservation.scope,
            actor: reservation.actor,
          });
        }
      }

      return sendCollectionError(res, err, fallbackMessage);
    } finally {
      const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      logSlowCollectionRoute(req as AuthenticatedRequest, elapsedMs, Number(res.statusCode || 0));
    }
  };
}

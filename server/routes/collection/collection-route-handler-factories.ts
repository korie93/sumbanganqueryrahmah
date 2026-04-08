import type { RequestHandler, Response } from "express";
import type { AuthenticatedRequest } from "../../auth/guards";
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
  Number.parseInt(String(process.env.COLLECTION_ROUTE_WARN_MS || "750"), 10) || 750,
);
const OBSERVED_COLLECTION_ROUTE_PATHS = new Set([
  "/api/collection/summary",
  "/api/collection/list",
  "/api/collection/nickname-summary",
  "/api/collection/daily/overview",
  "/api/collection/daily/day-details",
]);
const IDEMPOTENCY_FINGERPRINT_PARSE_CACHE_LIMIT = 256;
const idempotencyFingerprintValidationCache = new Map<string, true>();

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

  if (!idempotencyFingerprintValidationCache.has(normalized)) {
    try {
      JSON.parse(normalized);
    } catch {
      throw badRequest("Idempotency fingerprint must be valid JSON.");
    }

    idempotencyFingerprintValidationCache.set(normalized, true);
    if (idempotencyFingerprintValidationCache.size > IDEMPOTENCY_FINGERPRINT_PARSE_CACHE_LIMIT) {
      const oldestKey = idempotencyFingerprintValidationCache.keys().next().value;
      if (oldestKey) {
        idempotencyFingerprintValidationCache.delete(oldestKey);
      }
    }
  } else {
    idempotencyFingerprintValidationCache.delete(normalized);
    idempotencyFingerprintValidationCache.set(normalized, true);
  }

  return normalized;
}

export function clearIdempotencyFingerprintValidationCacheForTests() {
  idempotencyFingerprintValidationCache.clear();
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

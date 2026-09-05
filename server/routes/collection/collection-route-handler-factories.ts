import type { RequestHandler, Response } from "express";
import type { AuthenticatedRequest } from "../../auth/guards";
import { runtimeConfig } from "../../config/runtime";
import { badRequest, HttpError } from "../../http/errors";
import { logger } from "../../lib/logger";
import { safeJsonParse } from "../../lib/safe-json";
import type {
  PostgresStorage,
} from "../../storage-postgres";
import {
  createIdempotencyFingerprintValidationCacheController,
} from "./collection-idempotency-cache";
import { buildCollectionReceiptSecurityErrorResponse } from "../collection-receipt-error-response";
import { readUploadedReceiptRows } from "../../services/collection/collection-record-receipt-mutation-utils";
import { cleanupStoredCollectionReceipts } from "../../services/collection/collection-record-mutation-support";
export {
  createIdempotencyFingerprintValidationCacheController,
  isIdempotencyFingerprintValidationEntryExpired,
  pruneExpiredIdempotencyFingerprintValidationCache,
  pruneIdempotencyFingerprintValidationCache,
} from "./collection-idempotency-cache";

export type CollectionJsonRouteHandler = (req: AuthenticatedRequest) => Promise<unknown>;
export type CollectionMutationScopeResolver = (req: AuthenticatedRequest) => string;
export type CollectionMutationReplayAuthorizer = (req: AuthenticatedRequest, payload: unknown) => Promise<void>;

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
  "/api/collection/source-matches",
  "/api/collection/report/billing-principal",
  "/api/collection/nickname-summary",
  "/api/collection/monthly-target",
  "/api/collection/daily/overview",
  "/api/collection/daily/day-details",
]);

const idempotencyFingerprintValidationCacheController =
  createIdempotencyFingerprintValidationCacheController();

function getErrorRecord(error: unknown): Record<string, unknown> | null {
  return error && typeof error === "object" ? error as Record<string, unknown> : null;
}

function getNestedErrorField(error: unknown, field: string): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 3; depth += 1) {
    const record = getErrorRecord(current);
    if (!record) {
      return undefined;
    }

    const value = record[field];
    if (typeof value === "string" && value.trim()) {
      return value;
    }

    current = record.cause;
  }

  return undefined;
}

function getSafeErrorMessage(error: unknown): string | undefined {
  const message = getNestedErrorField(error, "message");
  if (!message) {
    return undefined;
  }

  if (/^Failed query:/i.test(message) || message.includes("\nparams:")) {
    return "Database query failed.";
  }

  return message.slice(0, 300);
}

export function sendCollectionError(res: Response, err: unknown, fallbackMessage: string) {
  const receiptSecurityResponse = buildCollectionReceiptSecurityErrorResponse(err);
  if (receiptSecurityResponse) {
    logger.warn("Collection receipt security check failed", {
      reasonCode: receiptSecurityResponse.body.error.code,
    });
    return res.status(receiptSecurityResponse.statusCode).json(receiptSecurityResponse.body);
  }

  if (err instanceof HttpError) {
    const message = err.expose ? err.message : fallbackMessage;
    return res.status(err.statusCode).json({
      ok: false,
      message,
      ...(err.expose && err.code ? { error: { code: err.code, message } } : {}),
    });
  }

  logger.error("Unhandled collection route error", {
    message: getSafeErrorMessage(err),
    errorName: getNestedErrorField(err, "name"),
    errorCode: getNestedErrorField(err, "code"),
    dbConstraint: getNestedErrorField(err, "constraint"),
    dbTable: getNestedErrorField(err, "table"),
    dbColumn: getNestedErrorField(err, "column"),
    dbDetail: getNestedErrorField(err, "detail"),
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
    const parseResult = safeJsonParse<unknown>(normalized, "collection_idempotency_fingerprint", {
      maxRawBytes: 512,
    });
    if (!parseResult.success) {
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
  authorizeReplay?: CollectionMutationReplayAuthorizer | undefined;
}): RequestHandler {
  const { fallbackMessage, handler, scopeResolver, storage } = params;

  return async (req, res) => {
    const startedAt = process.hrtime.bigint();
    let reservation: Awaited<ReturnType<typeof reserveCollectionMutationIdempotency>> | null = null;
    let handlerStarted = false;

    try {
      const authenticatedReq = req as AuthenticatedRequest;
      reservation = await reserveCollectionMutationIdempotency({
        req: authenticatedReq,
        scopeResolver,
        storage,
      });

      if (reservation.response) {
        if (reservation.response.status < 400) {
          await params.authorizeReplay?.(authenticatedReq, reservation.response.body);
        }
        return res.status(reservation.response.status).json(reservation.response.body);
      }

      handlerStarted = true;
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
      // The multipart parser owns these new uploads. A replay/early rejection
      // never reaches the service that normally persists or cleans them up.
      if (!handlerStarted && req.is("multipart/form-data")) {
        await cleanupStoredCollectionReceipts(readUploadedReceiptRows(req.body || {}));
      }
      const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      logSlowCollectionRoute(req as AuthenticatedRequest, elapsedMs, Number(res.statusCode || 0));
    }
  };
}

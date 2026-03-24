import type { Express, RequestHandler } from "express";
import type { AuthenticatedRequest } from "../../auth/guards";
import { badRequest } from "../../http/errors";
import { HttpError } from "../../http/errors";
import { logger } from "../../lib/logger";
import { CollectionService } from "../../services/collection.service";
import type { PostgresStorage } from "../../storage-postgres";

export type CollectionRouteDeps = {
  storage: PostgresStorage;
  authenticateToken: RequestHandler;
  requireRole: (...roles: string[]) => RequestHandler;
  requireTabAccess: (tabId: string) => RequestHandler;
};

export type CollectionJsonRouteHandler = (req: AuthenticatedRequest) => Promise<unknown>;

export type CollectionRouteContext = {
  app: Express;
  storage: PostgresStorage;
  collectionService: CollectionService;
  reportAccess: RequestHandler[];
  superuserReportAccess: RequestHandler[];
  adminSummaryAccess: RequestHandler[];
  jsonRoute: (fallbackMessage: string, handler: CollectionJsonRouteHandler) => RequestHandler;
  jsonMutationRoute: (
    fallbackMessage: string,
    scopeResolver: (req: AuthenticatedRequest) => string,
    handler: CollectionJsonRouteHandler,
  ) => RequestHandler;
};

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

function sendCollectionError(res: any, err: unknown, fallbackMessage: string) {
  if (err instanceof HttpError) {
    return res.status(err.statusCode).json({
      ok: false,
      message: err.message,
      ...(err.code ? { error: { code: err.code, message: err.message } } : {}),
    });
  }

  const message = (err as { message?: string })?.message || fallbackMessage;
  return res.status(500).json({ ok: false, message });
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

function toSerializableMutationBody(payload: unknown): unknown {
  if (payload === undefined) {
    return null;
  }

  return JSON.parse(JSON.stringify(payload));
}

export function createCollectionRouteContext(
  app: Express,
  deps: CollectionRouteDeps,
): CollectionRouteContext {
  const { storage, authenticateToken, requireRole, requireTabAccess } = deps;
  const collectionService = new CollectionService(storage);

  const reportAccess = [
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("collection-report"),
  ];
  const superuserReportAccess = [
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("collection-report"),
  ];
  const adminSummaryAccess = [
    authenticateToken,
    requireRole("admin", "superuser"),
    requireTabAccess("collection-report"),
  ];

  return {
    app,
    storage,
    collectionService,
    reportAccess,
    superuserReportAccess,
    adminSummaryAccess,
    jsonRoute(fallbackMessage, handler) {
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
    },
    jsonMutationRoute(fallbackMessage, scopeResolver, handler) {
      return async (req, res) => {
        const startedAt = process.hrtime.bigint();
        let idempotencyScope: string | null = null;
        let idempotencyActor: string | null = null;
        let idempotencyKey: string | null = null;
        let idempotencyReserved = false;

        try {
          const authenticatedReq = req as AuthenticatedRequest;
          idempotencyKey = normalizeIdempotencyHeaderValue(req.header("x-idempotency-key"));
          const requestFingerprint = normalizeIdempotencyHeaderValue(
            req.header("x-idempotency-fingerprint"),
            { maxLength: 2048 },
          );

          if (idempotencyKey && authenticatedReq.user?.username) {
            idempotencyScope = normalizeIdempotencyHeaderValue(scopeResolver(authenticatedReq), {
              maxLength: 512,
            });
            idempotencyActor = authenticatedReq.user.username;
            if (idempotencyScope) {
              const reservation = await storage.acquireMutationIdempotency({
                scope: idempotencyScope,
                actor: idempotencyActor,
                idempotencyKey,
                requestFingerprint,
              });

              if (reservation.status === "replay") {
                return res.status(reservation.responseStatus).json(reservation.responseBody);
              }

              if (reservation.status === "payload_mismatch") {
                return res.status(409).json({
                  ok: false,
                  message: "This request key was already used for a different collection mutation payload.",
                  error: {
                    code: "IDEMPOTENCY_KEY_PAYLOAD_MISMATCH",
                    message: "This request key was already used for a different collection mutation payload.",
                  },
                });
              }

              if (reservation.status === "in_progress") {
                return res.status(409).json({
                  ok: false,
                  message: "A matching collection mutation is still being processed. Please wait and refresh before retrying.",
                  error: {
                    code: "IDEMPOTENCY_KEY_IN_PROGRESS",
                    message: "A matching collection mutation is still being processed. Please wait and refresh before retrying.",
                  },
                });
              }

              idempotencyReserved = true;
            }
          }

          const payload = await handler(authenticatedReq);
          const serializablePayload = toSerializableMutationBody(payload);

          if (idempotencyReserved && idempotencyScope && idempotencyActor && idempotencyKey) {
            try {
              await storage.completeMutationIdempotency({
                scope: idempotencyScope,
                actor: idempotencyActor,
                idempotencyKey,
                responseStatus: 200,
                responseBody: serializablePayload,
              });
            } catch (error) {
              logger.warn("Failed to persist collection mutation idempotency response", {
                error,
                scope: idempotencyScope,
                actor: idempotencyActor,
              });
            }
          }

          return res.json(serializablePayload);
        } catch (err) {
          if (idempotencyReserved && idempotencyScope && idempotencyActor && idempotencyKey) {
            try {
              await storage.releaseMutationIdempotency({
                scope: idempotencyScope,
                actor: idempotencyActor,
                idempotencyKey,
              });
            } catch (releaseError) {
              logger.warn("Failed to release collection mutation idempotency reservation", {
                error: releaseError,
                scope: idempotencyScope,
                actor: idempotencyActor,
              });
            }
          }

          return sendCollectionError(res, err, fallbackMessage);
        } finally {
          const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
          logSlowCollectionRoute(req as AuthenticatedRequest, elapsedMs, Number(res.statusCode || 0));
        }
      };
    },
  };
}

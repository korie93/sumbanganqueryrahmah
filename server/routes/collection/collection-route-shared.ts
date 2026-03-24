import type { Express, RequestHandler } from "express";
import type { AuthenticatedRequest } from "../../auth/guards";
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
  };
}

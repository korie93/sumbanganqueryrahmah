import type { Express, RequestHandler } from "express";
import { CollectionService } from "../../services/collection.service";
import type { PostgresStorage } from "../../storage-postgres";
import {
  createCollectionJsonMutationRouteHandler,
  createCollectionJsonRouteHandler,
  type CollectionJsonRouteHandler,
  type CollectionMutationScopeResolver,
  type CollectionMutationReplayAuthorizer,
} from "./collection-route-handler-factories";

export type CollectionRouteDeps = {
  storage: PostgresStorage;
  authenticateToken: RequestHandler;
  requireRole: (...roles: string[]) => RequestHandler;
  requireTabAccess: (tabId: string) => RequestHandler;
  searchRateLimiter?: RequestHandler;
};

export type CollectionRouteContext = {
  app: Express;
  storage: PostgresStorage;
  collectionService: CollectionService;
  reportAccess: RequestHandler[];
  teamReportAccess: RequestHandler[];
  recordMutationAccess: RequestHandler[];
  sourceMatchAccess: RequestHandler[];
  superuserReportAccess: RequestHandler[];
  adminSummaryAccess: RequestHandler[];
  staffSummaryAccess: RequestHandler[];
  jsonRoute: (fallbackMessage: string, handler: CollectionJsonRouteHandler) => RequestHandler;
  jsonMutationRoute: (
    fallbackMessage: string,
    scopeResolver: CollectionMutationScopeResolver,
    handler: CollectionJsonRouteHandler,
    authorizeReplay?: CollectionMutationReplayAuthorizer,
  ) => RequestHandler;
};

export function createCollectionRouteContext(
  app: Express,
  deps: CollectionRouteDeps,
): CollectionRouteContext {
  const { storage, authenticateToken, requireRole, requireTabAccess } = deps;
  const collectionService = new CollectionService(storage);

  const reportAccess = [
    authenticateToken,
    requireRole("user", "admin", "manager", "superuser"),
    requireTabAccess("collection-report"),
  ];
  const teamReportAccess = [
    authenticateToken,
    requireRole("manager", "superuser"),
    requireTabAccess("collection-report"),
  ];
  const recordMutationAccess = [
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("collection-report"),
  ];
  const sourceMatchAccess = [
    ...recordMutationAccess,
    ...(deps.searchRateLimiter ? [deps.searchRateLimiter] : []),
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
  const staffSummaryAccess = [
    authenticateToken,
    requireRole("admin", "manager", "superuser"),
    requireTabAccess("collection-report"),
  ];

  return {
    app,
    storage,
    collectionService,
    reportAccess,
    teamReportAccess,
    recordMutationAccess,
    sourceMatchAccess,
    superuserReportAccess,
    adminSummaryAccess,
    staffSummaryAccess,
    jsonRoute(fallbackMessage, handler) {
      return createCollectionJsonRouteHandler({ fallbackMessage, handler });
    },
    jsonMutationRoute(fallbackMessage, scopeResolver, handler, authorizeReplay) {
      return createCollectionJsonMutationRouteHandler({
        fallbackMessage,
        handler,
        scopeResolver,
        storage,
        authorizeReplay,
      });
    },
  };
}

import type { Express, RequestHandler } from "express";
import { CollectionService } from "../../services/collection.service";
import type { PostgresStorage } from "../../storage-postgres";
import {
  createCollectionJsonMutationRouteHandler,
  createCollectionJsonRouteHandler,
  type CollectionJsonRouteHandler,
  type CollectionMutationScopeResolver,
} from "./collection-route-handler-factories";

export type CollectionRouteDeps = {
  storage: PostgresStorage;
  authenticateToken: RequestHandler;
  requireRole: (...roles: string[]) => RequestHandler;
  requireTabAccess: (tabId: string) => RequestHandler;
};

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
    scopeResolver: CollectionMutationScopeResolver,
    handler: CollectionJsonRouteHandler,
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
      return createCollectionJsonRouteHandler({ fallbackMessage, handler });
    },
    jsonMutationRoute(fallbackMessage, scopeResolver, handler) {
      return createCollectionJsonMutationRouteHandler({
        fallbackMessage,
        handler,
        scopeResolver,
        storage,
      });
    },
  };
}

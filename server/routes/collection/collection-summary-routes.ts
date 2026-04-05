import type { CollectionRouteContext } from "./collection-route-shared";

export function registerCollectionSummaryRoutes(context: CollectionRouteContext) {
  const {
    app,
    collectionService,
    reportAccess,
    superuserReportAccess,
    adminSummaryAccess,
    jsonRoute,
  } = context;

  app.get(
    "/api/collection/summary",
    ...reportAccess,
    jsonRoute("Failed to load collection summary.", (req) =>
      collectionService.getSummary(req.user, req.query as Record<string, unknown>)),
  );

  app.get(
    "/api/collection/list",
    ...reportAccess,
    jsonRoute("Failed to load collection records.", (req) =>
      collectionService.listRecords(req.user, req.query as Record<string, unknown>)),
  );

  app.get(
    "/api/collection/purge-summary",
    ...superuserReportAccess,
    jsonRoute("Failed to load purge summary.", (req) => collectionService.getPurgeSummary(req.user)),
  );

  app.get(
    "/api/collection/nickname-summary",
    ...adminSummaryAccess,
    jsonRoute("Failed to load nickname summary.", (req) =>
      collectionService.getNicknameSummary(req.user, req.query as Record<string, unknown>)),
  );
}

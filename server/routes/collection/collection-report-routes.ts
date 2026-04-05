import { registerCollectionRecordMutationRoutes } from "./collection-record-mutation-routes";
import { registerCollectionReceiptRoutes } from "./collection-receipt-routes";
import type { CollectionRouteContext } from "./collection-route-shared";

export function registerCollectionReportRoutes(context: CollectionRouteContext) {
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

  app.get(
    "/api/collection/daily/users",
    ...adminSummaryAccess,
    jsonRoute("Failed to load collection daily users.", (req) =>
      collectionService.listDailyUsers(req.user)),
  );

  app.put(
    "/api/collection/daily/target",
    ...adminSummaryAccess,
    jsonRoute("Failed to save collection daily target.", (req) =>
      collectionService.upsertDailyTarget(req.user, req.body)),
  );

  app.put(
    "/api/collection/daily/calendar",
    ...adminSummaryAccess,
    jsonRoute("Failed to save collection daily calendar.", (req) =>
      collectionService.upsertDailyCalendar(req.user, req.body)),
  );

  app.get(
    "/api/collection/daily/overview",
    ...reportAccess,
    jsonRoute("Failed to load collection daily overview.", (req) =>
      collectionService.getDailyOverview(req.user, req.query as Record<string, unknown>)),
  );

  app.get(
    "/api/collection/daily/day-details",
    ...reportAccess,
    jsonRoute("Failed to load collection daily details.", (req) =>
      collectionService.getDailyDayDetails(req.user, req.query as Record<string, unknown>)),
  );

  registerCollectionReceiptRoutes(context);
  registerCollectionRecordMutationRoutes(context);
}

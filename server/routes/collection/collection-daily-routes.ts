import type { CollectionRouteContext } from "./collection-route-shared";

export function registerCollectionDailyRoutes(context: CollectionRouteContext) {
  const {
    app,
    collectionService,
    reportAccess,
    superuserReportAccess,
    adminSummaryAccess,
    jsonRoute,
  } = context;

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

  app.delete(
    "/api/collection/daily/calendar",
    ...adminSummaryAccess,
    jsonRoute("Failed to delete collection daily calendar status.", (req) =>
      collectionService.deleteDailyCalendar(req.user, {
        ...(req.query as Record<string, unknown>),
        ...(req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {}),
      })),
  );

  app.get(
    "/api/collection/daily/calendar/audit",
    ...superuserReportAccess,
    jsonRoute("Failed to load collection daily calendar audit.", (req) =>
      collectionService.listDailyCalendarAudit(req.user, req.query as Record<string, unknown>)),
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
}

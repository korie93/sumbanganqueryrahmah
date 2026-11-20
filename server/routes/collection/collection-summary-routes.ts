import { readQueryObject, readRouteParam } from "../../http/validation";
import type { CollectionRouteContext } from "./collection-route-shared";

export function registerCollectionSummaryRoutes(context: CollectionRouteContext) {
  const {
    app,
    collectionService,
    reportAccess,
    superuserReportAccess,
    staffSummaryAccess,
    jsonRoute,
  } = context;

  app.get(
    "/api/collection/summary",
    ...reportAccess,
    jsonRoute("Failed to load collection summary.", (req) =>
      collectionService.getSummary(req.user, readQueryObject(req.query))),
  );

  app.get(
    "/api/collection/list",
    ...reportAccess,
    jsonRoute("Failed to load collection records.", (req) =>
      collectionService.listRecords(req.user, readQueryObject(req.query))),
  );

  app.get(
    "/api/collection/:id/receipts/:receiptId/compare/:relatedId",
    ...superuserReportAccess,
    jsonRoute("Failed to compare receipt records.", req => collectionService.getReceiptComparison(
      req.user, readRouteParam(req.params.id), readRouteParam(req.params.receiptId), readRouteParam(req.params.relatedId),
    )),
  );

  app.get(
    "/api/collection/:id/receipt-breakdown",
    ...reportAccess,
    jsonRoute("Failed to load receipt breakdown.", req =>
      collectionService.getReceiptBreakdown(req.user, readRouteParam(req.params.id, "collection record id"))),
  );

  app.get(
    "/api/collection/monthly-comparison",
    ...reportAccess,
    jsonRoute("Failed to load monthly collection comparison.", (req) =>
      collectionService.getMonthlyComparison(req.user, readQueryObject(req.query))),
  );

  app.get(
    "/api/collection/monthly-target",
    ...reportAccess,
    jsonRoute("Failed to load monthly collection target.", (req) =>
      collectionService.getMonthlyTarget(req.user, readQueryObject(req.query))),
  );

  app.get(
    "/api/collection/purge-summary",
    ...superuserReportAccess,
    jsonRoute("Failed to load purge summary.", (req) => collectionService.getPurgeSummary(req.user)),
  );

  app.get(
    "/api/collection/nickname-summary",
    ...staffSummaryAccess,
    jsonRoute("Failed to load nickname summary.", (req) =>
      collectionService.getNicknameSummary(req.user, readQueryObject(req.query))),
  );
}

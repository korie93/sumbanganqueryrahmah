import { registerCollectionDailyRoutes } from "./collection-daily-routes";
import { registerCollectionRecordMutationRoutes } from "./collection-record-mutation-routes";
import { registerCollectionReceiptRoutes } from "./collection-receipt-routes";
import { registerCollectionSummaryRoutes } from "./collection-summary-routes";
import type { CollectionRouteContext } from "./collection-route-shared";

export function registerCollectionReportRoutes(context: CollectionRouteContext) {
  registerCollectionSummaryRoutes(context);
  registerCollectionDailyRoutes(context);
  registerCollectionReceiptRoutes(context);
  registerCollectionRecordMutationRoutes(context);
}

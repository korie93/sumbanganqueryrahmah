import { registerCollectionDailyRoutes } from "./collection-daily-routes";
import { registerCollectionRecordMutationRoutes } from "./collection-record-mutation-routes";
import { registerCollectionReceiptRoutes } from "./collection-receipt-routes";
import { registerCollectionSummaryRoutes } from "./collection-summary-routes";
import type { CollectionRouteContext } from "./collection-route-shared";
import { registerCollectionSourceMatchRoutes } from "./collection-source-match-routes";
import { registerCollectionBillingPrincipalV7Routes } from "./collection-billing-principal-v7-routes";
import { registerCollectionManualSettlementRoutes } from "./collection-manual-settlement-routes";

export function registerCollectionReportRoutes(context: CollectionRouteContext) {
  registerCollectionSummaryRoutes(context);
  registerCollectionDailyRoutes(context);
  registerCollectionReceiptRoutes(context);
  registerCollectionRecordMutationRoutes(context);
  registerCollectionManualSettlementRoutes(context);
  registerCollectionSourceMatchRoutes(context);
  registerCollectionBillingPrincipalV7Routes(context);
}

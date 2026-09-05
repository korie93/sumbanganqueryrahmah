import { readRouteParam } from "../../http/validation";
import type { CollectionRouteContext } from "./collection-route-shared";

export function registerCollectionManualSettlementRoutes(context: CollectionRouteContext) {
  const {
    app,
    collectionService,
    reportAccess,
    superuserReportAccess,
    jsonRoute,
    jsonMutationRoute,
  } = context;

  const upsertHandler = jsonMutationRoute(
    "Failed to save Manual Verified ABORT.",
    (req) => `collection-record:manual-settlement:${readRouteParam(req.params.id, "collection record id")}`,
    (req) => collectionService.upsertManualSettlement(
      req.user,
      readRouteParam(req.params.id, "collection record id"),
      req.body,
    ),
  );

  app.post(
    "/api/collection/:id/manual-settlement",
    ...superuserReportAccess,
    upsertHandler,
  );
  app.put(
    "/api/collection/:id/manual-settlement",
    ...superuserReportAccess,
    upsertHandler,
  );
  app.delete(
    "/api/collection/:id/manual-settlement",
    ...superuserReportAccess,
    jsonMutationRoute(
      "Failed to revoke Manual Verified ABORT.",
      (req) => `collection-record:manual-settlement:revoke:${readRouteParam(req.params.id, "collection record id")}`,
      (req) => collectionService.revokeManualSettlement(
        req.user,
        readRouteParam(req.params.id, "collection record id"),
        req.body,
      ),
    ),
  );
  app.get(
    "/api/collection/:id/manual-settlement/history",
    ...reportAccess,
    jsonRoute("Failed to load Manual Verified ABORT history.", (req) =>
      collectionService.getManualSettlementHistory(
        req.user,
        readRouteParam(req.params.id, "collection record id"),
        req.query.limit,
      )),
  );
}

import { createCollectionMultipartRoute } from "./collection-multipart-routes";
import type { CollectionRouteContext } from "./collection-route-shared";

export function registerCollectionRecordMutationRoutes(context: CollectionRouteContext) {
  const {
    app,
    collectionService,
    reportAccess,
    superuserReportAccess,
    jsonRoute,
    jsonMutationRoute,
  } = context;
  const collectionMultipartRoute = createCollectionMultipartRoute();

  app.post(
    "/api/collection",
    ...reportAccess,
    collectionMultipartRoute,
    jsonMutationRoute(
      "Failed to create collection record.",
      () => "collection-record:create",
      (req) => collectionService.createRecord(req.user, req.body),
    ),
  );

  const handleUpdateCollectionRecord = jsonMutationRoute(
    "Failed to update collection record.",
    (req) => `collection-record:update:${String(req.params.id || "").trim()}`,
    (req) => collectionService.updateRecord(req.user, req.params.id, req.body),
  );

  app.patch(
    "/api/collection/:id",
    ...reportAccess,
    collectionMultipartRoute,
    handleUpdateCollectionRecord,
  );

  app.put(
    "/api/collection/:id",
    ...reportAccess,
    collectionMultipartRoute,
    handleUpdateCollectionRecord,
  );

  app.delete(
    "/api/collection/purge-old",
    ...superuserReportAccess,
    jsonRoute("Failed to purge old collection records.", (req) =>
      collectionService.purgeOldRecords(req.user, req.body)),
  );

  app.delete(
    "/api/collection/:id",
    ...reportAccess,
    jsonMutationRoute(
      "Failed to delete collection record.",
      (req) => `collection-record:delete:${String(req.params.id || "").trim()}`,
      (req) => collectionService.deleteRecord(req.user, req.params.id, req.body),
    ),
  );
}

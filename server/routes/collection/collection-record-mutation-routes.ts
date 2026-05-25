import { createCollectionMultipartRoute } from "./collection-multipart-routes";
import type { CollectionRouteContext } from "./collection-route-shared";
import { readRouteParam } from "../../http/validation";

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
    (req) => {
      const recordId = readRouteParam(req.params.id, "collection record id");
      return `collection-record:update:${recordId}`;
    },
    (req) => {
      const recordId = readRouteParam(req.params.id, "collection record id");
      return collectionService.updateRecord(req.user, recordId, req.body);
    },
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
      (req) => {
        const recordId = readRouteParam(req.params.id, "collection record id");
        return `collection-record:delete:${recordId}`;
      },
      (req) => {
        const recordId = readRouteParam(req.params.id, "collection record id");
        return collectionService.deleteRecord(req.user, recordId, req.body);
      },
    ),
  );
}

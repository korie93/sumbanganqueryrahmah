import { createCollectionMultipartRoute } from "./collection-multipart-routes";
import type { CollectionRouteContext } from "./collection-route-shared";
import { readRouteParam } from "../../http/validation";
import type { AuthenticatedRequest } from "../../auth/guards";
import { forbidden } from "../../http/errors";
import { getAccessibleCollectionRecordOrThrow } from "../../services/collection/collection-record-write-shared";

export function registerCollectionRecordMutationRoutes(context: CollectionRouteContext) {
  const {
    app,
    collectionService,
    storage,
    reportAccess,
    superuserReportAccess,
    jsonRoute,
    jsonMutationRoute,
  } = context;
  const collectionMultipartRoute = createCollectionMultipartRoute();
  const updateCollectionMultipartRoute = createCollectionMultipartRoute({
    authorizeRequest: async (req) => {
      const authenticatedReq = req as AuthenticatedRequest;
      if (!authenticatedReq.user) {
        throw forbidden("Forbidden");
      }
      const recordId = readRouteParam(authenticatedReq.params.id, "collection record id");
      await getAccessibleCollectionRecordOrThrow(storage, authenticatedReq.user, recordId);
    },
  });

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
    updateCollectionMultipartRoute,
    handleUpdateCollectionRecord,
  );

  app.put(
    "/api/collection/:id",
    ...reportAccess,
    updateCollectionMultipartRoute,
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

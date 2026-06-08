import { createCollectionMultipartRoute } from "./collection-multipart-routes";
import type { CollectionRouteContext } from "./collection-route-shared";
import { createAuthorizeCollectionRecordAccess } from "../collection-access";
import { readRouteParam } from "../../http/validation";

export function registerCollectionRecordMutationRoutes(context: CollectionRouteContext) {
  const {
    app,
    collectionService,
    storage,
    recordMutationAccess,
    superuserReportAccess,
    jsonRoute,
    jsonMutationRoute,
  } = context;
  const collectionMultipartRoute = createCollectionMultipartRoute();
  const updateCollectionMultipartRoute = createCollectionMultipartRoute({
    authorizeRequest: createAuthorizeCollectionRecordAccess({ storage }),
  });

  app.post(
    "/api/collection",
    ...recordMutationAccess,
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
    ...recordMutationAccess,
    updateCollectionMultipartRoute,
    handleUpdateCollectionRecord,
  );

  app.put(
    "/api/collection/:id",
    ...recordMutationAccess,
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
    ...recordMutationAccess,
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

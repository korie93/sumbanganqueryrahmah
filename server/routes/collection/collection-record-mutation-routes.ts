import { createCollectionMultipartRoute } from "./collection-multipart-routes";
import type { CollectionRouteContext } from "./collection-route-shared";
import { createAuthorizeCollectionRecordAccess } from "../collection-access";
import { readRouteParam } from "../../http/validation";
import { forbidden } from "../../http/errors";
import { ensureLooseObject, normalizeCollectionText } from "../collection.validation";
import {
  assertCollectionStaffNicknameWriteAccess,
  getAccessibleCollectionRecordOrThrow,
  requireCollectionStaffNicknameCreateAccess,
} from "../../services/collection/collection-record-write-shared";
import type { CollectionMutationReplayAuthorizer } from "./collection-route-handler-factories";

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
  const authorizeRecordReplay: CollectionMutationReplayAuthorizer = async (req, payload) => {
    if (!req.user) throw forbidden();
    const cachedRecord = ensureLooseObject(ensureLooseObject(payload)?.record);
    const id = normalizeCollectionText(cachedRecord?.id);
    if (!id) throw forbidden();
    const existing = await getAccessibleCollectionRecordOrThrow(storage, req.user, id);
    await assertCollectionStaffNicknameWriteAccess(storage, req.user, existing.collectionStaffNickname);
    await assertCollectionStaffNicknameWriteAccess(
      storage, req.user, normalizeCollectionText(cachedRecord?.collectionStaffNickname),
    );
    const nickname = normalizeCollectionText(ensureLooseObject(req.body)?.collectionStaffNickname);
    if (req.method === "POST") {
      await requireCollectionStaffNicknameCreateAccess(storage, req.user, nickname);
    } else if (nickname) {
      await assertCollectionStaffNicknameWriteAccess(storage, req.user, nickname);
    }
  };

  app.post(
    "/api/collection",
    ...recordMutationAccess,
    collectionMultipartRoute,
    jsonMutationRoute(
      "Failed to create collection record.",
      () => "collection-record:create",
      (req) => collectionService.createRecord(req.user, req.body),
      authorizeRecordReplay,
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
    authorizeRecordReplay,
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

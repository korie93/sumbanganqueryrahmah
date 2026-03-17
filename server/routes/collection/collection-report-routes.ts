import type { AuthenticatedRequest } from "../../auth/guards";
import { serveCollectionReceipt } from "../collection-receipt.service";
import type { CollectionRouteContext } from "./collection-route-shared";

export function registerCollectionReportRoutes(context: CollectionRouteContext) {
  const {
    app,
    storage,
    collectionService,
    reportAccess,
    superuserReportAccess,
    adminSummaryAccess,
    jsonRoute,
  } = context;

  app.post(
    "/api/collection",
    ...reportAccess,
    jsonRoute("Failed to create collection record.", (req) => collectionService.createRecord(req.user, req.body)),
  );

  app.get(
    "/api/collection/summary",
    ...reportAccess,
    jsonRoute("Failed to load collection summary.", (req) =>
      collectionService.getSummary(req.user, req.query as Record<string, unknown>)),
  );

  app.get(
    "/api/collection/list",
    ...reportAccess,
    jsonRoute("Failed to load collection records.", (req) =>
      collectionService.listRecords(req.user, req.query as Record<string, unknown>)),
  );

  app.get(
    "/api/collection/purge-summary",
    ...superuserReportAccess,
    jsonRoute("Failed to load purge summary.", (req) => collectionService.getPurgeSummary(req.user)),
  );

  app.get(
    "/api/collection/nickname-summary",
    ...adminSummaryAccess,
    jsonRoute("Failed to load nickname summary.", (req) =>
      collectionService.getNicknameSummary(req.user, req.query as Record<string, unknown>)),
  );

  app.get(
    "/api/collection/:id/receipt/view",
    ...reportAccess,
    async (req: AuthenticatedRequest, res) => serveCollectionReceipt(storage, req, res, "view"),
  );

  app.get(
    "/api/collection/:id/receipt/download",
    ...reportAccess,
    async (req: AuthenticatedRequest, res) => serveCollectionReceipt(storage, req, res, "download"),
  );

  app.get(
    "/api/collection/:id/receipts/:receiptId/view",
    ...reportAccess,
    async (req: AuthenticatedRequest, res) =>
      serveCollectionReceipt(storage, req, res, "view", req.params.receiptId),
  );

  app.get(
    "/api/collection/:id/receipts/:receiptId/download",
    ...reportAccess,
    async (req: AuthenticatedRequest, res) =>
      serveCollectionReceipt(storage, req, res, "download", req.params.receiptId),
  );

  app.get(
    "/api/receipts/:id/view",
    ...reportAccess,
    async (req: AuthenticatedRequest, res) => serveCollectionReceipt(storage, req, res, "view"),
  );

  app.get(
    "/api/receipts/:id/download",
    ...reportAccess,
    async (req: AuthenticatedRequest, res) => serveCollectionReceipt(storage, req, res, "download"),
  );

  const handleUpdateCollectionRecord = jsonRoute("Failed to update collection record.", (req) =>
    collectionService.updateRecord(req.user, req.params.id, req.body));

  app.patch(
    "/api/collection/:id",
    ...reportAccess,
    handleUpdateCollectionRecord,
  );

  app.put(
    "/api/collection/:id",
    ...reportAccess,
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
    jsonRoute("Failed to delete collection record.", (req) =>
      collectionService.deleteRecord(req.user, req.params.id)),
  );
}

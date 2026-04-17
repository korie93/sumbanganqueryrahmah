import type { AuthenticatedRequest } from "../../auth/guards";
import { serveCollectionReceipt } from "../collection-receipt.service";
import type { CollectionRouteContext } from "./collection-route-shared";

function createCollectionReceiptRouteHandler(params: {
  context: Pick<CollectionRouteContext, "storage">;
  mode: "view" | "download";
  resolveReceiptId?: (req: AuthenticatedRequest) => string | null | undefined;
}) {
  return (req: AuthenticatedRequest, res: Parameters<typeof serveCollectionReceipt>[2]) => {
    void serveCollectionReceipt(
      params.context.storage,
      req,
      res,
      params.mode,
      params.resolveReceiptId ? params.resolveReceiptId(req) : undefined,
    );
  };
}

export function registerCollectionReceiptRoutes(context: CollectionRouteContext) {
  const viewPrimaryReceipt = createCollectionReceiptRouteHandler({
    context,
    mode: "view",
  });
  const downloadPrimaryReceipt = createCollectionReceiptRouteHandler({
    context,
    mode: "download",
  });
  const viewSpecificReceipt = createCollectionReceiptRouteHandler({
    context,
    mode: "view",
    resolveReceiptId: (req) => req.params.receiptId,
  });
  const downloadSpecificReceipt = createCollectionReceiptRouteHandler({
    context,
    mode: "download",
    resolveReceiptId: (req) => req.params.receiptId,
  });

  context.app.get(
    "/api/collection/:id/receipt/view",
    ...context.reportAccess,
    viewPrimaryReceipt,
  );

  context.app.get(
    "/api/collection/:id/receipt/download",
    ...context.reportAccess,
    downloadPrimaryReceipt,
  );

  context.app.get(
    "/api/collection/:id/receipts/:receiptId/view",
    ...context.reportAccess,
    viewSpecificReceipt,
  );

  context.app.get(
    "/api/collection/:id/receipts/:receiptId/download",
    ...context.reportAccess,
    downloadSpecificReceipt,
  );

  context.app.get(
    "/api/receipts/:id/view",
    ...context.reportAccess,
    viewPrimaryReceipt,
  );

  context.app.get(
    "/api/receipts/:id/download",
    ...context.reportAccess,
    downloadPrimaryReceipt,
  );
}

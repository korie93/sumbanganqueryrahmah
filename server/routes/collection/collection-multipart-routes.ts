import type { RequestHandler } from "express";
import {
  removeCollectionReceiptFile,
  saveMultipartCollectionReceipt,
} from "../collection-receipt.service";
import type { MultipartCollectionBody } from "./collection-multipart-body-utils";
import { createCollectionReceiptMultipartRoute } from "./collection-multipart-receipt-route";

type CollectionMultipartRouteBody = MultipartCollectionBody & {
  uploadedReceipts?: StoredCollectionReceiptFile[];
};
type StoredCollectionReceiptFile = Awaited<ReturnType<typeof saveMultipartCollectionReceipt>>;

export function createCollectionMultipartRoute(): RequestHandler {
  return createCollectionReceiptMultipartRoute<StoredCollectionReceiptFile, CollectionMultipartRouteBody>({
    attachKey: "uploadedReceipts",
    handleReceipt: saveMultipartCollectionReceipt,
    cleanupReceipts: async (receipts) => {
      await Promise.allSettled(
        receipts.map((receipt) => removeCollectionReceiptFile(receipt.storagePath)),
      );
    },
  });
}

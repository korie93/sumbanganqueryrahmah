import type {
  CollectionReceiptMetadata,
  CollectionRecordReceipt,
} from "@/lib/api";
import { createClientRandomId } from "@/lib/secure-id";

export type CollectionReceiptDraftInput = {
  draftLocalId: string;
  receiptId?: string | null;
  receiptAmount: string;
  receiptDate: string;
  receiptReference: string;
  fileHash?: string | null;
};

function createReceiptDraftLocalId() {
  return createClientRandomId("receipt-draft");
}

export function createEmptyCollectionReceiptDraft(
  overrides?: Partial<CollectionReceiptDraftInput>,
): CollectionReceiptDraftInput {
  return {
    draftLocalId: overrides?.draftLocalId || createReceiptDraftLocalId(),
    receiptId: overrides?.receiptId ?? null,
    receiptAmount: overrides?.receiptAmount || "",
    receiptDate: overrides?.receiptDate || "",
    receiptReference: overrides?.receiptReference || "",
    fileHash: overrides?.fileHash ?? null,
  };
}

export function createCollectionReceiptDraftFromReceipt(
  receipt: CollectionRecordReceipt,
): CollectionReceiptDraftInput {
  return createEmptyCollectionReceiptDraft({
    draftLocalId: receipt.id,
    receiptId: receipt.id,
    receiptAmount: receipt.receiptAmount || "",
    receiptDate: receipt.receiptDate || "",
    receiptReference: receipt.receiptReference || "",
    fileHash: receipt.fileHash,
  });
}

export function buildCollectionReceiptMetadataPayload(
  draft: CollectionReceiptDraftInput,
): CollectionReceiptMetadata {
  return {
    receiptId: draft.receiptId || undefined,
    receiptAmount: draft.receiptAmount.trim() || null,
    receiptDate: draft.receiptDate.trim() || null,
    receiptReference: draft.receiptReference.trim() || null,
    fileHash: draft.fileHash || null,
  };
}

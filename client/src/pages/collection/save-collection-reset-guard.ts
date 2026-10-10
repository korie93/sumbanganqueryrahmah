import type { CollectionReceiptDraftInput } from "./receipt-validation";
import type { SaveCollectionDraftRestoreNotice, SaveCollectionFormValues } from "./save-collection-page-utils";

type SaveCollectionResetState = {
  values: SaveCollectionFormValues;
  receiptFileCount: number;
  receiptDrafts: readonly CollectionReceiptDraftInput[];
  draftRestoreNotice: SaveCollectionDraftRestoreNotice | null;
};

export function hasSaveCollectionResettableWork({
  values,
  receiptFileCount,
  receiptDrafts,
  draftRestoreNotice,
}: SaveCollectionResetState): boolean {
  // Do not trim: even whitespace is user input that Reset would discard.
  // The supplied nickname and default batch are not an unsaved collection.
  return [
    values.customerName,
    values.icNumber,
    values.customerPhone,
    values.accountNumber,
    values.cardNumber,
    values.paymentDate,
    values.amount,
  ].some((value) => value.length > 0)
    || values.batch !== "P10"
    || receiptFileCount > 0
    || receiptDrafts.length > 0
    || draftRestoreNotice?.hadPendingReceipts === true;
}

export function getSaveCollectionResetDecision({
  hasWork,
  submitting,
  accessSuspended,
  confirmed = false,
}: {
  hasWork: boolean;
  submitting: boolean;
  accessSuspended: boolean;
  confirmed?: boolean;
}): "ignore" | "confirm" | "reset" {
  if (submitting || accessSuspended) return "ignore";
  return hasWork && !confirmed ? "confirm" : "reset";
}

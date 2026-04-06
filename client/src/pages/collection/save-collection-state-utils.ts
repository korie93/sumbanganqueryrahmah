import type { CollectionReceiptDraftInput } from "@/pages/collection/receipt-validation";
import type { SaveCollectionDraft } from "@/pages/collection/save-collection-draft";
import type {
  SaveCollectionDraftRestoreNotice,
  SaveCollectionFormValues,
} from "@/pages/collection/save-collection-page-utils";

export type SaveCollectionRestoredFormValues = Omit<
  SaveCollectionFormValues,
  "staffNickname"
>;

export function createEmptySaveCollectionRestoredFormValues(): SaveCollectionRestoredFormValues {
  return {
    customerName: "",
    icNumber: "",
    customerPhone: "",
    accountNumber: "",
    batch: "P10",
    paymentDate: "",
    amount: "",
  };
}

export function buildSaveCollectionDraftPersistPayload(
  values: SaveCollectionFormValues,
  hasPendingReceipts: boolean,
): Omit<SaveCollectionDraft, "savedAt"> {
  return {
    customerName: values.customerName,
    icNumber: values.icNumber,
    customerPhone: values.customerPhone,
    accountNumber: values.accountNumber,
    batch: values.batch,
    paymentDate: values.paymentDate,
    amount: values.amount,
    hadPendingReceipts: hasPendingReceipts,
  };
}

export function buildSaveCollectionDraftRestoreState(
  restoredDraft: SaveCollectionDraft | null,
): {
  values: SaveCollectionRestoredFormValues;
  notice: SaveCollectionDraftRestoreNotice | null;
} {
  if (!restoredDraft) {
    return {
      values: createEmptySaveCollectionRestoredFormValues(),
      notice: null,
    };
  }

  return {
    values: {
      customerName: restoredDraft.customerName,
      icNumber: restoredDraft.icNumber,
      customerPhone: restoredDraft.customerPhone,
      accountNumber: restoredDraft.accountNumber,
      batch: restoredDraft.batch,
      paymentDate: restoredDraft.paymentDate,
      amount: restoredDraft.amount,
    },
    notice: {
      restoredAt: restoredDraft.savedAt,
      hadPendingReceipts: restoredDraft.hadPendingReceipts,
    },
  };
}

export function applySaveCollectionReceiptDraftPatch(
  drafts: CollectionReceiptDraftInput[],
  index: number,
  patch: Partial<CollectionReceiptDraftInput>,
): CollectionReceiptDraftInput[] {
  return drafts.map((draft, draftIndex) => (
    draftIndex === index ? { ...draft, ...patch } : draft
  ));
}

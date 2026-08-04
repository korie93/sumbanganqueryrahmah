import type { SaveCollectionFormValues } from "@/pages/collection/save-collection-page-utils";
import { formatAmountRM } from "@/pages/collection/utils";

export type SaveCollectionLastSavedSummary = {
  customerName: string;
  sourceLabel: string;
  staffNickname: string;
  batch: string;
  amountLabel: string;
  receiptLabel: string;
  savedAtLabel: string;
};

export function buildSaveCollectionReceiptLabel(receiptCount: number): string {
  const normalizedCount = Math.max(0, Number.isFinite(receiptCount) ? Math.trunc(receiptCount) : 0);
  return `${normalizedCount} ${normalizedCount === 1 ? "receipt" : "receipts"}`;
}

export function buildSaveCollectionLastSavedSummary(params: {
  values: SaveCollectionFormValues;
  receiptCount: number;
  savedAt?: Date;
}): SaveCollectionLastSavedSummary {
  const savedAt = params.savedAt ?? new Date();
  return {
    customerName: params.values.customerName.trim() || "Customer",
    sourceLabel: params.values.sourceImportName.trim()
      || params.values.sourceFilename.trim()
      || "Source not recorded",
    staffNickname: params.values.staffNickname.trim() || "staff dipilih",
    batch: params.values.batch,
    amountLabel: formatAmountRM(params.values.amount),
    receiptLabel: buildSaveCollectionReceiptLabel(params.receiptCount),
    savedAtLabel: Number.isNaN(savedAt.getTime())
      ? "baru sahaja"
      : savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  };
}

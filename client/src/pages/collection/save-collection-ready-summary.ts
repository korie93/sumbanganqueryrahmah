import type { CollectionReceiptDraftInput } from "@/pages/collection/receipt-validation";
import type { SaveCollectionFormValues } from "@/pages/collection/save-collection-page-utils";
import { formatAmountRM } from "@/pages/collection/utils";
import { parseCollectionAmountMyrNumber } from "@shared/collection-amount-types";

export type SaveCollectionReadySummaryItem = {
  label: string;
  value: string;
  missing?: boolean;
};

export type SaveCollectionReviewHint = {
  id: string;
  message: string;
};

function normalizeComparableText(value: string): string {
  return String(value || "").trim().replace(/\s+/g, "").toLowerCase();
}

function formatSummaryValue(value: string): SaveCollectionReadySummaryItem["value"] {
  const normalized = String(value || "").trim();
  return normalized || "Belum diisi";
}

export function buildSaveCollectionReadySummary(params: {
  values: SaveCollectionFormValues;
  receiptCount: number;
}): SaveCollectionReadySummaryItem[] {
  const amount = parseCollectionAmountMyrNumber(params.values.amount);
  const receiptCount = Math.max(0, Number.isFinite(params.receiptCount) ? Math.trunc(params.receiptCount) : 0);

  return [
    {
      label: "Customer",
      value: formatSummaryValue(params.values.customerName),
      missing: !params.values.customerName.trim(),
    },
    {
      label: "IC",
      value: formatSummaryValue(params.values.icNumber),
      missing: !params.values.icNumber.trim(),
    },
    {
      label: "Account",
      value: formatSummaryValue(params.values.accountNumber),
      missing: !params.values.accountNumber.trim(),
    },
    {
      label: "Batch",
      value: params.values.batch,
    },
    {
      label: "Date",
      value: formatSummaryValue(params.values.paymentDate),
      missing: !params.values.paymentDate.trim(),
    },
    {
      label: "Amount",
      value: amount > 0 ? formatAmountRM(amount) : "Belum diisi",
      missing: amount <= 0,
    },
    {
      label: "Receipt",
      value: `${receiptCount} ${receiptCount === 1 ? "receipt" : "receipts"}`,
    },
  ];
}

export function buildSaveCollectionReceiptReviewHints(params: {
  values: SaveCollectionFormValues;
  receiptDrafts: CollectionReceiptDraftInput[];
}): SaveCollectionReviewHint[] {
  const hints: SaveCollectionReviewHint[] = [];
  const mainAmount = parseCollectionAmountMyrNumber(params.values.amount);
  const mainDate = params.values.paymentDate.trim();
  const accountNumber = normalizeComparableText(params.values.accountNumber);

  params.receiptDrafts.forEach((draft, index) => {
    const receiptNumber = index + 1;
    const receiptAmount = parseCollectionAmountMyrNumber(draft.receiptAmount);
    const receiptDate = draft.receiptDate.trim();
    const receiptReference = normalizeComparableText(draft.receiptReference);

    if (receiptAmount > 0 && mainAmount > 0 && receiptAmount !== mainAmount) {
      hints.push({
        id: `${draft.draftLocalId}:amount`,
        message: `Receipt ${receiptNumber}: receipt amount ${formatAmountRM(receiptAmount)} berbeza dengan amount utama ${formatAmountRM(mainAmount)}.`,
      });
    }

    if (receiptDate && mainDate && receiptDate !== mainDate) {
      hints.push({
        id: `${draft.draftLocalId}:date`,
        message: `Receipt ${receiptNumber}: receipt date ${receiptDate} berbeza dengan payment date ${mainDate}.`,
      });
    }

    if (receiptReference && accountNumber && receiptReference !== accountNumber) {
      hints.push({
        id: `${draft.draftLocalId}:reference`,
        message: `Receipt ${receiptNumber}: receipt reference berbeza dengan account number utama. Pastikan nombor rujukan ini betul.`,
      });
    }
  });

  return hints;
}

export function buildSaveCollectionSuccessDescription(params: {
  values: SaveCollectionFormValues;
  receiptCount: number;
  sourceLabel?: string | null;
}): string {
  const receiptCount = Math.max(0, Number.isFinite(params.receiptCount) ? Math.trunc(params.receiptCount) : 0);
  const staffNickname = params.values.staffNickname.trim() || "staff dipilih";
  const amountLabel = formatAmountRM(params.values.amount);
  const receiptLabel = `${receiptCount} ${receiptCount === 1 ? "receipt" : "receipts"}`;
  const sourceLabel = String(params.sourceLabel || "").trim();
  const sourceMessage = sourceLabel
    ? ` Dipautkan automatik kepada Saved: ${sourceLabel}.`
    : " Tiada baris Saved yang sepadan ditemui; rekod collection tetap disimpan.";
  return `${amountLabel} disimpan untuk ${staffNickname}, batch ${params.values.batch}, ${receiptLabel}.${sourceMessage}`;
}

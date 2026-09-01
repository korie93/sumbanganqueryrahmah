import type { CollectionReceiptDraftInput } from "@/pages/collection/receipt-validation";
import {
  getSaveCollectionReadiness,
  type SaveCollectionFieldName,
  type SaveCollectionFormValues,
  type SaveCollectionReadiness,
} from "@/pages/collection/save-collection-page-utils";
import { formatAmountRM } from "@/pages/collection/utils";
import { parseCollectionAmountMyrNumber } from "@shared/collection-amount-types";

export type SaveCollectionReadySummaryItem = {
  label: string;
  value: string;
  missing?: boolean;
  error?: string;
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

function maskCardNumber(value: string): string {
  const compact = String(value || "").trim().replace(/\s+/g, "");
  return compact ? `Card ending ${compact.slice(-4)}` : "";
}

function buildValidatedSummaryItem(params: {
  field: SaveCollectionFieldName;
  label: string;
  value: string;
  readiness: SaveCollectionReadiness;
}): SaveCollectionReadySummaryItem {
  const error = params.readiness.errors[params.field];
  const normalizedValue = formatSummaryValue(params.value);

  return {
    label: params.label,
    value: error && normalizedValue !== "Belum diisi" ? "Perlu diperbetulkan" : normalizedValue,
    missing: Boolean(error),
    ...(error ? { error } : {}),
  };
}

export function buildSaveCollectionReadySummary(params: {
  values: SaveCollectionFormValues;
  receiptCount: number;
  readiness?: SaveCollectionReadiness;
}): SaveCollectionReadySummaryItem[] {
  const amount = parseCollectionAmountMyrNumber(params.values.amount);
  const receiptCount = Math.max(0, Number.isFinite(params.receiptCount) ? Math.trunc(params.receiptCount) : 0);
  const readiness = params.readiness ?? getSaveCollectionReadiness(params.values);

  return [
    buildValidatedSummaryItem({
      field: "staffNickname",
      label: "Staff",
      value: params.values.staffNickname,
      readiness,
    }),
    buildValidatedSummaryItem({
      field: "customerName",
      label: "Customer",
      value: params.values.customerName,
      readiness,
    }),
    buildValidatedSummaryItem({
      field: "icNumber",
      label: "IC",
      value: params.values.icNumber,
      readiness,
    }),
    buildValidatedSummaryItem({
      field: "customerPhone",
      label: "Phone",
      value: params.values.customerPhone,
      readiness,
    }),
    buildValidatedSummaryItem({
      field: "accountNumber",
      label: "Account",
      value: params.values.accountNumber,
      readiness,
    }),
    buildValidatedSummaryItem({
      field: "cardNumber",
      label: "Card",
      value: maskCardNumber(params.values.cardNumber),
      readiness,
    }),
    buildValidatedSummaryItem({
      field: "batch",
      label: "Batch",
      value: params.values.batch,
      readiness,
    }),
    buildValidatedSummaryItem({
      field: "paymentDate",
      label: "Date",
      value: params.values.paymentDate,
      readiness,
    }),
    buildValidatedSummaryItem({
      field: "amount",
      label: "Amount",
      value: amount > 0 ? formatAmountRM(amount) : "",
      readiness,
    }),
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
    ? ` Dipautkan kepada Saved yang disahkan: ${sourceLabel}.`
    : " Source Saved ditentukan secara auto-matching.";
  return `${amountLabel} disimpan untuk ${staffNickname}, batch ${params.values.batch}, ${receiptLabel}.${sourceMessage}`;
}

import type { CollectionRecord } from "@/lib/api";

type CollectionMonthDetailsRowAriaOptions = {
  formattedAmount: string;
  formattedPaymentDate: string;
  index: number;
  record: CollectionRecord;
};

function normalizeCollectionSummaryValue(value: string | null | undefined) {
  const normalized = String(value ?? "-").replace(/\s+/g, " ").trim();
  return normalized || "-";
}

export function buildCollectionMonthDetailsRowAriaLabel({
  formattedAmount,
  formattedPaymentDate,
  index,
  record,
}: CollectionMonthDetailsRowAriaOptions) {
  return [
    `Monthly collection record ${index}`,
    `customer ${normalizeCollectionSummaryValue(record.customerName)}`,
    `amount ${normalizeCollectionSummaryValue(formattedAmount)}`,
    `payment date ${normalizeCollectionSummaryValue(formattedPaymentDate)}`,
    `batch ${normalizeCollectionSummaryValue(record.batch)}`,
    `account ${normalizeCollectionSummaryValue(record.accountNumber)}`,
    `staff ${normalizeCollectionSummaryValue(record.collectionStaffNickname)}`,
  ].join(", ");
}

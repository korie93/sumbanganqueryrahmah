import type { CollectionRecord } from "@/lib/api/collection-types";

type CollectionRecordRowAriaOptions = {
  formattedAmount: string;
  formattedPaymentDate: string;
  record: CollectionRecord;
  recordNumber: number;
};

export function buildCollectionRecordRowAriaLabel({
  formattedAmount,
  formattedPaymentDate,
  record,
  recordNumber,
}: CollectionRecordRowAriaOptions) {
  const receiptCount = record.receipts?.length ?? 0;

  return [
    `Collection record ${recordNumber}`,
    `customer ${record.customerName}`,
    `amount ${formattedAmount}`,
    `payment date ${formattedPaymentDate}`,
    `batch ${record.batch || "-"}`,
    `staff nickname ${record.collectionStaffNickname || "-"}`,
    receiptCount > 0
      ? `${receiptCount} receipt${receiptCount === 1 ? "" : "s"} attached`
      : "no receipts attached",
  ].join(", ");
}

import { useContext } from "react";
import { cn } from "@/lib/utils";
import type { CollectionRecord, CollectionRecordReceipt } from "@/lib/api";
import { formatIsoDateToDDMMYYYY } from "@/lib/date-format";
import { formatCollectionOptionalAmount } from "./collection-coverage";
import { CollectionRecordsTranslation } from "./collection-records-translation";

type ReceiptPreviewRecordDetailsProps = {
  id: string;
  record: CollectionRecord | null;
  selectedReceipt: CollectionRecordReceipt | null;
  showDetails: boolean;
  isMobile: boolean;
};

function ReceiptDetail({ label, value, amount = false }: { label: string; value: string; amount?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs leading-4 text-muted-foreground">{label}</dt>
      <dd className={cn("mt-0.5 wrap-anywhere text-sm leading-5", amount && "font-semibold tabular-nums")}>{value}</dd>
    </div>
  );
}

export function ReceiptPreviewRecordDetails({
  id,
  record,
  selectedReceipt,
  showDetails,
  isMobile,
}: ReceiptPreviewRecordDetailsProps) {
  const t = useContext(CollectionRecordsTranslation);
  if (!record) {
    return null;
  }
  const missing = t("common.collection.records.missing");

  return (
    <div
      id={id}
      role="region"
      aria-label={t("common.collection.receipts.details")}
      hidden={!showDetails}
      tabIndex={0}
      className={cn("mt-2 shrink-0 rounded-md border border-border/60 bg-background/40 px-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", isMobile ? "mx-3 max-h-[30vh] overflow-y-auto" : "focus-visible:ring-inset")}
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        <ReceiptDetail label={t("common.collection.receipts.recordedPayment")} value={formatCollectionOptionalAmount(record.amount, missing)} amount />
        <ReceiptDetail label={t("common.collection.receipts.allReceiptsTotal")} value={formatCollectionOptionalAmount(record.receiptTotalAmount, missing)} amount />
        <ReceiptDetail label={t("common.collection.receipts.customer")} value={record.customerName?.trim() || missing} />
        <ReceiptDetail label={t("common.collection.receipts.paymentDate")} value={formatIsoDateToDDMMYYYY(record.paymentDate)} />
      </dl>
      {selectedReceipt && (
        <div className="mt-3 border-t border-border pt-3">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4 [&>div:last-child]:col-span-2">
            <ReceiptDetail label={t("common.collection.receipts.thisReceiptAmount")} value={formatCollectionOptionalAmount(selectedReceipt.receiptAmount, missing)} amount />
            <ReceiptDetail label={t("common.collection.receipts.receiptDate")} value={selectedReceipt.receiptDate ? formatIsoDateToDDMMYYYY(selectedReceipt.receiptDate) : missing} />
            <ReceiptDetail label={t("common.collection.receipts.reference")} value={selectedReceipt.receiptReference?.trim() || missing} />
          </dl>
          <p className="mt-2 wrap-anywhere text-xs text-muted-foreground">
            {[selectedReceipt.originalFileName, selectedReceipt.originalMimeType].filter(Boolean).join(" · ")}
          </p>
        </div>
      )}
    </div>
  );
}

import { cn } from "@/lib/utils";
import type { CollectionRecord, CollectionRecordReceipt } from "@/lib/api";
import { formatIsoDateToDDMMYYYY } from "@/lib/date-format";
import { formatAmountRM } from "@/pages/collection/utils";

type ReceiptPreviewRecordDetailsProps = {
  id: string;
  record: CollectionRecord | null;
  selectedReceipt: CollectionRecordReceipt | null;
  showDetails: boolean;
  isMobile: boolean;
};

export function ReceiptPreviewRecordDetails({
  id,
  record,
  selectedReceipt,
  showDetails,
  isMobile,
}: ReceiptPreviewRecordDetailsProps) {
  if (!record) {
    return null;
  }

  return (
    <div
      id={id}
      role="region"
      aria-label="Receipt and collection details"
      hidden={!showDetails}
      tabIndex={0}
      className={cn("max-h-[30vh] shrink-0 overflow-y-auto rounded-md border border-border/60 bg-background/40 px-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", isMobile ? "mx-3 mt-2" : "mt-2")}
    >
      {selectedReceipt ? (
        <p className="mb-3 break-all text-xs text-muted-foreground">
          {selectedReceipt.originalFileName} · {selectedReceipt.originalMimeType}
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="break-words">
          <p className="text-2xs uppercase tracking-wide text-muted-foreground">Customer</p>
          <p className="text-sm font-medium">{record.customerName}</p>
        </div>
        <div>
          <p className="text-2xs uppercase tracking-wide text-muted-foreground">Payment Date</p>
          <p className="text-sm font-medium">{formatIsoDateToDDMMYYYY(record.paymentDate)}</p>
        </div>
        <div>
          <p className="text-2xs uppercase tracking-wide text-muted-foreground">Total Paid</p>
          <p className="text-sm font-medium">{formatAmountRM(record.amount)}</p>
        </div>
        <div>
          <p className="text-2xs uppercase tracking-wide text-muted-foreground">Receipt Total</p>
          <p className="text-sm font-medium">{formatAmountRM(record.receiptTotalAmount)}</p>
        </div>
        {selectedReceipt ? (
          <>
            <div>
              <p className="text-2xs uppercase tracking-wide text-muted-foreground">Receipt Amount</p>
              <p className="text-sm font-medium">
                {selectedReceipt.receiptAmount ? formatAmountRM(selectedReceipt.receiptAmount) : "-"}
              </p>
            </div>
            <div>
              <p className="text-2xs uppercase tracking-wide text-muted-foreground">Receipt Date</p>
              <p className="text-sm font-medium">
                {selectedReceipt.receiptDate ? formatIsoDateToDDMMYYYY(selectedReceipt.receiptDate) : "-"}
              </p>
            </div>
            <div>
              <p className="text-2xs uppercase tracking-wide text-muted-foreground">Reference</p>
              <p className="break-words text-sm font-medium">{selectedReceipt.receiptReference || "-"}</p>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

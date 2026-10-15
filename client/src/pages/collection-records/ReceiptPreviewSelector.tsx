import { Button } from "@/components/ui/button";
import { getAriaPressedProps } from "@/lib/aria-state-props";
import { cn } from "@/lib/utils";
import type { CollectionRecordReceipt } from "@/lib/api";

type ReceiptPreviewSelectorProps = {
  receipts: CollectionRecordReceipt[];
  selectedReceipt: CollectionRecordReceipt | null;
  loading: boolean;
  isMobile: boolean;
  onSelectReceipt: (receiptId: string) => void;
};

export function ReceiptPreviewSelector({
  receipts,
  selectedReceipt,
  loading,
  isMobile,
  onSelectReceipt,
}: ReceiptPreviewSelectorProps) {
  if (receipts.length <= 1) return null;
  const selectedIndex = receipts.findIndex((receipt) => receipt.id === selectedReceipt?.id);

  return (
    <div className={cn("min-w-0 shrink-0", isMobile ? "mx-3 mt-2" : "mt-2")}>
      <p className="mb-2 text-xs text-muted-foreground">
        Receipt {Math.max(0, selectedIndex) + 1} of {receipts.length}
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Choose receipt" aria-busy={loading}>
        {receipts.map((receipt, index) => (
          <Button
            key={receipt.id}
            type="button"
            size="sm"
            variant={selectedReceipt?.id === receipt.id ? "default" : "outline"}
            onClick={() => onSelectReceipt(receipt.id)}
            {...getAriaPressedProps(selectedReceipt?.id === receipt.id)}
            aria-label={`Receipt ${index + 1}: ${receipt.originalFileName || "Unnamed receipt"}`}
            title={receipt.originalFileName || `Receipt ${index + 1}`}
            className="max-w-[12rem] shrink-0 gap-2"
          >
            <span className="shrink-0">{index + 1}.</span>
            <span className="truncate">{receipt.originalFileName || "Receipt"}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}

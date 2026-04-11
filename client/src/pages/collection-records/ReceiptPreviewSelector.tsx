import { Button } from "@/components/ui/button";
import { HorizontalScrollHint } from "@/components/HorizontalScrollHint";
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
  if (receipts.length <= 1) {
    return null;
  }

  return (
    <div
      className={cn(
        "rounded-md border border-border/60 bg-background/40 p-3",
        isMobile ? "mx-3 mt-3" : "mt-3 flex flex-wrap items-center gap-2",
      )}
    >
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Receipts
      </span>
      {isMobile ? (
        <HorizontalScrollHint
          className="mt-2"
          viewportClassName="flex w-max min-w-full gap-2"
          hint="Swipe receipts"
        >
          {receipts.map((receipt, index) => (
            <Button
              key={receipt.id}
              type="button"
              size="sm"
              variant={selectedReceipt?.id === receipt.id ? "default" : "outline"}
              onClick={() => onSelectReceipt(receipt.id)}
              disabled={loading}
              className="shrink-0"
            >
              #{index + 1}
            </Button>
          ))}
        </HorizontalScrollHint>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {receipts.map((receipt, index) => (
            <Button
              key={receipt.id}
              type="button"
              size="sm"
              variant={selectedReceipt?.id === receipt.id ? "default" : "outline"}
              onClick={() => onSelectReceipt(receipt.id)}
              disabled={loading}
            >
              #{index + 1}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

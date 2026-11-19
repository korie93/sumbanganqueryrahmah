import { useContext } from "react";
import { Button } from "@/components/ui/button";
import { getAriaPressedProps } from "@/lib/aria-state-props";
import { cn } from "@/lib/utils";
import type { CollectionRecordReceipt } from "@/lib/api";
import { formatCollectionOptionalAmount } from "./collection-coverage";
import { CollectionRecordsTranslation } from "./collection-records-translation";

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
  const t = useContext(CollectionRecordsTranslation);
  if (receipts.length <= 1) return null;
  const selectedIndex = receipts.findIndex((receipt) => receipt.id === selectedReceipt?.id);

  return (
    <div className={cn("min-w-0 shrink-0", isMobile ? "mx-3 mt-2" : "mt-2")}>
      {selectedIndex >= 0 && (
        <p className="mb-2 text-xs text-muted-foreground">
          {t("common.collection.receipts.position", { current: selectedIndex + 1, total: receipts.length })}
        </p>
      )}
      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label={t("common.collection.receipts.choose")} aria-busy={loading}>
        {receipts.map((receipt, index) => {
          const amount = formatCollectionOptionalAmount(receipt.receiptAmount, "");
          const filename = receipt.originalFileName?.trim() || t("common.collection.receipts.unnamed");
          const selected = selectedReceipt?.id === receipt.id;
          return (
            <Button
              key={receipt.id}
              type="button"
              size="sm"
              variant={selected ? "default" : "outline"}
              onClick={() => onSelectReceipt(receipt.id)}
              {...getAriaPressedProps(selected)}
              title={filename}
              className="max-w-[12rem] shrink-0 tabular-nums"
            >
              <span className="truncate">{index + 1} · {amount || filename}</span>
              {amount && <span className="sr-only">{", "}{filename}</span>}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

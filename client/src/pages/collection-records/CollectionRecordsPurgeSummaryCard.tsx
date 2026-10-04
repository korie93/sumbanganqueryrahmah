import { Button } from "@/components/ui/button";
import { formatAmountRM } from "@/pages/collection/utils";
import type { CollectionAmountMyrNumber } from "@shared/collection-amount-types";

export interface CollectionRecordsPurgeSummaryCardProps {
  loadingRecords: boolean;
  purgeSummaryLoading: boolean;
  purgingOldRecords: boolean;
  purgeSummary: {
    cutoffDate: string;
    eligibleRecords: number;
    totalAmount: CollectionAmountMyrNumber;
  } | null;
  onOpenPurgeDialog: () => void;
}

export function CollectionRecordsPurgeSummaryCard({
  loadingRecords,
  purgeSummaryLoading,
  purgingOldRecords,
  purgeSummary,
  onOpenPurgeDialog,
}: CollectionRecordsPurgeSummaryCardProps) {
  return (
    <section aria-label="Manual Purge Data Lama">
      <details className="border-l-2 border-warning/40 bg-muted/30 px-3">
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
          Manual Purge Data Lama · {purgeSummaryLoading ? "Checking..." : `${purgeSummary?.eligibleRecords ?? 0} eligible`}
        </summary>
        <div className="flex flex-col gap-3 pb-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              Rekod collection sebelum {purgeSummary?.cutoffDate || "-"} hanya boleh dipurge oleh superuser.
            </p>
            <p className="text-xs text-muted-foreground">
              Eligible:{" "}
              <span className="font-medium text-foreground">
                {purgeSummaryLoading ? "Checking..." : purgeSummary?.eligibleRecords ?? 0}
              </span>
              {" | "}
              Total:{" "}
              <span className="font-medium text-foreground">
                {formatAmountRM(purgeSummary?.totalAmount ?? 0)}
              </span>
            </p>
          </div>
          <Button
            type="button"
            variant="destructive"
            className="w-full rounded-md sm:w-auto"
            onClick={onOpenPurgeDialog}
            disabled={
              loadingRecords ||
              purgeSummaryLoading ||
              purgingOldRecords ||
              !purgeSummary ||
              purgeSummary.eligibleRecords <= 0
            }
          >
            {purgingOldRecords ? "Purging..." : "Purge > 6 Months"}
          </Button>
        </div>
      </details>
    </section>
  );
}

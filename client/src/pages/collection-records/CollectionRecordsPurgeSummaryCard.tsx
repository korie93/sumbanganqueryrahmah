import { Card, CardContent } from "@/components/ui/card";
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
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardContent className="flex flex-col gap-3 px-3 py-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">Manual Purge Data Lama</p>
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
          variant="destructive"
          className="w-full sm:w-auto"
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
      </CardContent>
    </Card>
  );
}

import { Suspense } from "react";
import { lazyWithPreload } from "@/lib/lazy-with-preload";
import { CollectionDailyCalendarCard } from "@/pages/collection/CollectionDailyCalendarCard";
import { CollectionDailyFiltersCard } from "@/pages/collection/CollectionDailyFiltersCard";
import { CollectionDailySummaryCard } from "@/pages/collection/CollectionDailySummaryCard";
import { useCollectionDailyPageModel } from "@/pages/collection/useCollectionDailyPageModel";

const CollectionDailyDayDetailsDialog = lazyWithPreload(() =>
  import("@/pages/collection/CollectionDailyDayDetailsDialog").then((module) => ({
    default: module.CollectionDailyDayDetailsDialog,
  })),
);
const ReceiptPreviewDialog = lazyWithPreload(() =>
  import("@/pages/collection-records/ReceiptPreviewDialog").then((module) => ({
    default: module.ReceiptPreviewDialog,
  })),
);

type CollectionDailyPageProps = {
  role: string;
};

export default function CollectionDailyPage({ role }: CollectionDailyPageProps) {
  const model = useCollectionDailyPageModel({ role });

  return (
    <div className="space-y-4" data-testid="collection-daily-page">
      <CollectionDailyFiltersCard {...model.filtersCardProps} />

      {model.overview ? <CollectionDailySummaryCard overview={model.overview} /> : null}

      <CollectionDailyCalendarCard {...model.calendarCardProps} />

      {model.dayDetailsDialogProps.open ? (
        <Suspense fallback={null}>
          <CollectionDailyDayDetailsDialog {...model.dayDetailsDialogProps} />
        </Suspense>
      ) : null}

      {model.receiptPreviewDialogProps.open ? (
        <Suspense fallback={null}>
          <ReceiptPreviewDialog {...model.receiptPreviewDialogProps} />
        </Suspense>
      ) : null}
    </div>
  );
}

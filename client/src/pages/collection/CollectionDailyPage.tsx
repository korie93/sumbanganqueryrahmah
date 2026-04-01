import { Suspense, lazy } from "react";
import { CollectionDailyCalendarCard } from "@/pages/collection/CollectionDailyCalendarCard";
import { CollectionDailyFiltersCard } from "@/pages/collection/CollectionDailyFiltersCard";
import { CollectionDailySummaryCard } from "@/pages/collection/CollectionDailySummaryCard";
import { useCollectionDailyPageModel } from "@/pages/collection/useCollectionDailyPageModel";

const CollectionDailyDayDetailsDialog = lazy(() =>
  import("@/pages/collection/CollectionDailyDayDetailsDialog").then((module) => ({
    default: module.CollectionDailyDayDetailsDialog,
  })),
);
const ReceiptPreviewDialog = lazy(() =>
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
    <div className="space-y-5" data-testid="collection-daily-page">
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

import { CollectionDailyCalendarCard } from "@/pages/collection/CollectionDailyCalendarCard";
import { CollectionDailyDayDetailsDialog } from "@/pages/collection/CollectionDailyDayDetailsDialog";
import { CollectionDailyFiltersCard } from "@/pages/collection/CollectionDailyFiltersCard";
import { CollectionDailySummaryCard } from "@/pages/collection/CollectionDailySummaryCard";
import { ReceiptPreviewDialog } from "@/pages/collection-records/ReceiptPreviewDialog";
import { useCollectionDailyPageModel } from "@/pages/collection/useCollectionDailyPageModel";

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

      <CollectionDailyDayDetailsDialog {...model.dayDetailsDialogProps} />

      {model.receiptPreviewDialogProps.open ? (
        <ReceiptPreviewDialog {...model.receiptPreviewDialogProps} />
      ) : null}
    </div>
  );
}

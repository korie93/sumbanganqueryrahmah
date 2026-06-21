import { Suspense, lazy } from "react";
import { LazyDialogFallback } from "@/components/LazySuspenseFallback";
import { CalendarDailyView } from "@/pages/collection/CalendarDailyView";
import { CollectionDailyFiltersCard } from "@/pages/collection/CollectionDailyFiltersCard";
import { CollectionDailyRoleGuide } from "@/pages/collection/CollectionDailyRoleGuide";
import { CollectionDailySummaryCard } from "@/pages/collection/CollectionDailySummaryCard";
import { useCollectionDailyPageModel } from "@/pages/collection/useCollectionDailyPageModel";
import "./CollectionDailyCalendarAttentionSummary.css";
import "./CollectionDailyCalendarAuditMeta.css";
import "./CollectionDailyCalendarBulkToolbar.css";
import "./CollectionDailyCalendarChangeReview.css";
import "./CollectionDailyCalendarConflictNotice.css";
import "./CollectionDailyCalendarConflictReport.css";
import "./CollectionDailyCalendarDayBadge.css";
import "./CollectionDailyCalendarMonthlyBreakdown.css";
import "./CollectionDailyCalendarQuickFilter.css";
import "./CollectionDailyCalendarRoleModeNotice.css";
import "./CollectionDailyCalendarStatusSummary.css";
import "./CollectionDailyCalendarViewModeControl.css";
import "./CollectionDailyPage.css";
import "./CollectionDailyCalendarViewModes.css";

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
    <div className="collection-daily-page space-y-4" data-testid="collection-daily-page">
      <CollectionDailyRoleGuide {...model.roleGuideProps} />

      <CollectionDailyFiltersCard {...model.filtersCardProps} />

      {model.overview ? <CollectionDailySummaryCard overview={model.overview} /> : null}

      <CalendarDailyView {...model.calendarCardProps} />

      {model.dayDetailsDialogProps.open ? (
        <Suspense fallback={<LazyDialogFallback label="Loading collection day details dialog..." />}>
          <CollectionDailyDayDetailsDialog {...model.dayDetailsDialogProps} />
        </Suspense>
      ) : null}

      {model.receiptPreviewDialogProps.open ? (
        <Suspense fallback={<LazyDialogFallback label="Loading receipt preview dialog..." />}>
          <ReceiptPreviewDialog {...model.receiptPreviewDialogProps} />
        </Suspense>
      ) : null}
    </div>
  );
}

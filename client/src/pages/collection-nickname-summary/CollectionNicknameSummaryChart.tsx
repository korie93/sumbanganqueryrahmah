import { lazy, Suspense } from "react";
import { OperationalSectionCard } from "@/components/layout/OperationalPage";
import type { CollectionNicknameSummaryChartContentProps } from "@/pages/collection-nickname-summary/CollectionNicknameSummaryChartContent";
import { formatIsoDateToDDMMYYYY } from "@/lib/date-format";

const CollectionNicknameSummaryChartContent = lazy(() =>
  import("@/pages/collection-nickname-summary/CollectionNicknameSummaryChartContent").then(
    (module) => ({
      default: module.CollectionNicknameSummaryChartContent,
    }),
  ),
);

type CollectionNicknameSummaryChartProps = CollectionNicknameSummaryChartContentProps & {
  fromDate: string;
  toDate: string;
};

function CollectionNicknameSummaryChartFallback() {
  return (
    <div
      className="min-h-[320px] rounded-lg border border-border/60 bg-muted/10 px-4 py-10 text-center text-sm text-muted-foreground sm:min-h-[360px]"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      Loading nickname summary chart...
    </div>
  );
}

export function CollectionNicknameSummaryChart({
  fromDate,
  toDate,
  ...contentProps
}: CollectionNicknameSummaryChartProps) {
  const dateRange =
    fromDate && toDate
      ? `${formatIsoDateToDDMMYYYY(fromDate)} - ${formatIsoDateToDDMMYYYY(toDate)}`
      : "Selected date range";

  return (
    <OperationalSectionCard
      title="Nickname Summary Chart"
      description={`Total collection by nickname for ${dateRange}.`}
      className="min-w-0"
      contentClassName="min-w-0"
    >
      <Suspense fallback={<CollectionNicknameSummaryChartFallback />}>
        <CollectionNicknameSummaryChartContent {...contentProps} />
      </Suspense>
    </OperationalSectionCard>
  );
}

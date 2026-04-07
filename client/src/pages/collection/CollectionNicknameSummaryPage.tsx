import { lazy, memo, Suspense, useMemo, useState } from "react";
import { CollectionReportFreshnessBadge } from "@/components/collection-report/CollectionReportFreshnessBadge";
import { OperationalSectionCard } from "@/components/layout/OperationalPage";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCollectionNicknameSummaryData } from "@/pages/collection-nickname-summary/useCollectionNicknameSummaryData";
import { CollectionNicknameSummaryDesktopFilters } from "@/pages/collection/CollectionNicknameSummaryDesktopFilters";
import { CollectionNicknameSummaryMobileFilters } from "@/pages/collection/CollectionNicknameSummaryMobileFilters";
import {
  CollectionNicknameSummaryIdleState,
  CollectionNicknameSummaryLoadingState,
} from "@/pages/collection/CollectionNicknameSummaryStates";
import {
  countCollectionNicknameSummaryControls,
  formatCollectionNicknameSummaryMobileDateRange,
  getCollectionNicknameSummaryPreview,
} from "@/pages/collection/collection-nickname-summary-page-utils";

const CollectionNicknameBatchSections = lazy(() =>
  import("@/pages/collection-nickname-summary/CollectionNicknameBatchSections").then((module) => ({
    default: module.CollectionNicknameBatchSections,
  })),
);

type CollectionNicknameSummaryPageProps = {
  role: string;
};

function CollectionNicknameSummaryPage({ role }: CollectionNicknameSummaryPageProps) {
  const canAccess = role === "admin" || role === "superuser";
  const isMobile = useIsMobile();
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const summaryData = useCollectionNicknameSummaryData({ canAccess });
  const activeControlCount = countCollectionNicknameSummaryControls({
    selectedNicknames: summaryData.selectedNicknames,
    fromDate: summaryData.fromDate,
    toDate: summaryData.toDate,
  });
  const canReset = activeControlCount > 0 || summaryData.hasApplied;
  const { selectedNicknamePreview, remainingNicknameCount } = useMemo(
    () => getCollectionNicknameSummaryPreview(summaryData.selectedNicknames),
    [summaryData.selectedNicknames],
  );
  const mobileDateRangeLabel = useMemo(
    () => formatCollectionNicknameSummaryMobileDateRange(summaryData.fromDate, summaryData.toDate),
    [summaryData.fromDate, summaryData.toDate],
  );

  if (!canAccess) {
    return (
      <OperationalSectionCard contentClassName="py-10 text-center text-sm text-muted-foreground">
        Nickname Summary hanya tersedia untuk admin dan superuser.
      </OperationalSectionCard>
    );
  }

  return (
    <OperationalSectionCard
      title="Nickname Summary"
      description={summaryData.freshness?.message || "Compare selected staff nicknames over a chosen date range."}
      badge={<CollectionReportFreshnessBadge freshness={summaryData.freshness} />}
      contentClassName="space-y-4"
    >
      {isMobile ? (
        <CollectionNicknameSummaryMobileFilters
          summaryData={summaryData}
          activeControlCount={activeControlCount}
          canReset={canReset}
          mobileFiltersOpen={mobileFiltersOpen}
          mobileDateRangeLabel={mobileDateRangeLabel}
          selectedNicknamePreview={selectedNicknamePreview}
          remainingNicknameCount={remainingNicknameCount}
          setMobileFiltersOpen={setMobileFiltersOpen}
        />
      ) : (
        <CollectionNicknameSummaryDesktopFilters summaryData={summaryData} />
      )}

      {summaryData.hasApplied || summaryData.loadingSummary ? (
        <Suspense fallback={<CollectionNicknameSummaryLoadingState />}>
          <CollectionNicknameBatchSections
            loading={summaryData.loadingSummary}
            hasApplied={summaryData.hasApplied}
            selectedNicknames={summaryData.selectedNicknames}
            fromDate={summaryData.fromDate}
            toDate={summaryData.toDate}
            totalAmount={summaryData.totalAmount}
            totalRecords={summaryData.totalRecords}
            nicknameTotals={summaryData.nicknameTotals}
          />
        </Suspense>
      ) : (
        <CollectionNicknameSummaryIdleState />
      )}
    </OperationalSectionCard>
  );
}

export default memo(CollectionNicknameSummaryPage);

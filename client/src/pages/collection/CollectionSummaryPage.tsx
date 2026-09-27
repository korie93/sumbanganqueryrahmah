import { Suspense, lazy, memo, useMemo, useRef, useState } from "react";
import { Filter, RotateCcw } from "lucide-react";
import { CollectionReportFreshnessBadge } from "@/components/collection-report/CollectionReportFreshnessBadge";
import { LazyDialogFallback } from "@/components/LazySuspenseFallback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { buildCollectionSummaryPageViewModels } from "@/pages/collection-summary/collection-summary-page-view-models";
import { CollectionSummaryBarChartDialog } from "@/pages/collection-summary/CollectionSummaryBarChartDialog";
import { CollectionSummaryFilters } from "@/pages/collection-summary/CollectionSummaryFilters";
import { useCollectionSummaryData } from "@/pages/collection-summary/useCollectionSummaryData";
import { useCollectionSummaryMonthDialog } from "@/pages/collection-summary/useCollectionSummaryMonthDialog";
import { CollectionSummaryTable } from "@/pages/collection-summary/CollectionSummaryTable";
import { CollectionSummaryTotals } from "@/pages/collection-summary/CollectionSummaryTotals";

const CollectionMonthDetailsDialog = lazy(() =>
  import("@/pages/collection-summary/CollectionMonthDetailsDialog").then((module) => ({
    default: module.CollectionMonthDetailsDialog,
  })),
);

type CollectionSummaryPageProps = {
  role: string;
};

function CollectionSummaryPage({ role }: CollectionSummaryPageProps) {
  const canFilterByNickname =
    role === "admin" || role === "manager" || role === "superuser";
  const isMobile = useIsMobile();
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const mobileFiltersTriggerRef = useRef<HTMLButtonElement>(null);
  const summaryData = useCollectionSummaryData({ canFilterByNickname });
  const { handleSelectMonth, monthDialog, selectedMonth } =
    useCollectionSummaryMonthDialog({
      canFilterByNickname,
      selectedYear: summaryData.selectedYear,
      selectedNicknames: summaryData.selectedNicknames,
      summaryRows: summaryData.summaryRows,
    });
  const viewModels = buildCollectionSummaryPageViewModels({
    canFilterByNickname,
    summaryData,
    monthDialogState: {
      handleSelectMonth,
      monthDialog,
      selectedMonth,
    },
  });
  const activeFilterCount =
    (summaryData.selectedYear !== String(summaryData.currentYear) ? 1 : 0) +
    (summaryData.selectedNicknames.length > 0 ? 1 : 0);
  const selectedNicknamePreview = useMemo(
    () => summaryData.selectedNicknames.slice(0, 2),
    [summaryData.selectedNicknames],
  );
  const remainingNicknameCount = summaryData.selectedNicknames.length - selectedNicknamePreview.length;
  const handleResetMobileScope = () => {
    summaryData.setSelectedYear(String(summaryData.currentYear));
    summaryData.clearAllSelected();
    setMobileFiltersOpen(false);
  };

  return (
    <section aria-labelledby="collection-summary-heading" className="min-w-0 space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 id="collection-summary-heading" className="text-lg font-semibold">Collection Summary</h2>
          <p className="text-sm text-muted-foreground">{summaryData.freshness?.message || "Review monthly totals and open a month for its collection records."}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CollectionReportFreshnessBadge freshness={summaryData.freshness} />
          <CollectionSummaryBarChartDialog {...viewModels.barChart} />
        </div>
      </header>
      {isMobile ? (
        <>
          <div
            className="space-y-3"
            data-floating-ai-avoid="true"
          >
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    Year {summaryData.selectedYear}
                  </Badge>
                  <Badge variant="outline">
                    {summaryData.selectedNicknames.length > 0
                      ? summaryData.selectedNicknameLabel
                      : "All staff nicknames"}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  ref={mobileFiltersTriggerRef}
                  className="h-11 w-full justify-center gap-1 px-2"
                  aria-haspopup="dialog"
                  aria-label="Summary Filters"
                  onClick={() => setMobileFiltersOpen(true)}
                >
                  <Filter className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Filters
                  {activeFilterCount > 0 ? (
                    <Badge variant="secondary" className="px-1.5">
                      {activeFilterCount}
                    </Badge>
                  ) : null}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full"
                  onClick={handleResetMobileScope}
                  disabled={summaryData.loading || activeFilterCount === 0}
                >
                  <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                  Reset
                  </Button>
              </div>

              {selectedNicknamePreview.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {selectedNicknamePreview.map((nickname) => (
                    <Badge key={nickname} variant="secondary" className="max-w-full whitespace-normal break-words">
                      {nickname}
                    </Badge>
                  ))}
                  {remainingNicknameCount > 0 ? (
                    <Badge variant="outline">
                      +{remainingNicknameCount} more
                    </Badge>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
            <SheetContent
              side="bottom"
              className="rounded-t-2xl bg-background px-4 pb-[calc(var(--safe-area-inset-bottom)+1rem)] pt-4"
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                mobileFiltersTriggerRef.current?.focus({ preventScroll: true });
              }}
              data-floating-ai-avoid="true"
            >
              <SheetHeader className="pr-8 text-left">
                <SheetTitle>Collection Summary Filters</SheetTitle>
                <SheetDescription>
                  Adjust the year or limit the summary to selected staff nicknames. Changes refresh the summary automatically.
                </SheetDescription>
              </SheetHeader>

              <div className="mt-4 space-y-4 overflow-y-auto pr-1">
                <section className="space-y-4" aria-label="Summary scope">
                  <CollectionSummaryFilters {...viewModels.filters} />
                </section>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    className="h-11"
                    onClick={() => setMobileFiltersOpen(false)}
                  >
                    Done
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11"
                    onClick={handleResetMobileScope}
                    disabled={summaryData.loading || activeFilterCount === 0}
                  >
                    Reset
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </>
      ) : (
        <div>
          <CollectionSummaryFilters {...viewModels.filters} />
        </div>
      )}

      <CollectionSummaryTotals {...viewModels.totals} />

      <CollectionSummaryTable {...viewModels.table} />

      {viewModels.monthDialog?.open ? (
        <Suspense fallback={<LazyDialogFallback label="Loading collection month details dialog..." />}>
          <CollectionMonthDetailsDialog {...viewModels.monthDialog} />
        </Suspense>
      ) : null}
    </section>
  );
}

const MemoizedCollectionSummaryPage = memo(CollectionSummaryPage);
MemoizedCollectionSummaryPage.displayName = "CollectionSummaryPage";

export default MemoizedCollectionSummaryPage;

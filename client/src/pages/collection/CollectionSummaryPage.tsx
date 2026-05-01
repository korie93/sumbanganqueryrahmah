import { Suspense, lazy, memo, useMemo, useState } from "react";
import { CalendarRange, Filter, RotateCcw } from "lucide-react";
import { CollectionReportFreshnessBadge } from "@/components/collection-report/CollectionReportFreshnessBadge";
import { OperationalSectionCard } from "@/components/layout/OperationalPage";
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
  const canFilterByNickname = role === "admin" || role === "superuser";
  const isMobile = useIsMobile();
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
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
    <OperationalSectionCard
      title="Collection Summary"
      description={summaryData.freshness?.message || "Review monthly totals with a cleaner month-by-month drill-down flow."}
      badge={<CollectionReportFreshnessBadge freshness={summaryData.freshness} />}
      contentClassName="space-y-4"
    >
      {isMobile ? (
        <>
          <div
            className="rounded-[1.5rem] border border-border/60 bg-background/80 px-3 py-3 shadow-sm"
            data-floating-ai-avoid="true"
          >
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px]">
                    Year {summaryData.selectedYear}
                  </Badge>
                  <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px]">
                    {summaryData.selectedNicknames.length > 0
                      ? summaryData.selectedNicknameLabel
                      : "All staff nicknames"}
                  </Badge>
                </div>
                <h1 className="text-lg font-bold tracking-tight text-foreground">
                  Collection Summary
                </h1>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  className="h-11 w-full justify-center rounded-2xl"
                  onClick={() => setMobileFiltersOpen(true)}
                >
                  <Filter className="mr-2 h-4 w-4" />
                  Summary Filters
                  {activeFilterCount > 0 ? (
                    <Badge variant="secondary" className="ml-2 rounded-full px-2 py-0.5 text-[11px]">
                      {activeFilterCount}
                    </Badge>
                  ) : null}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full rounded-2xl"
                  onClick={handleResetMobileScope}
                  disabled={summaryData.loading || activeFilterCount === 0}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reset
                  </Button>
              </div>

              {selectedNicknamePreview.length > 0 ? (
                <div className="flex flex-wrap gap-2 rounded-2xl border border-border/60 bg-muted/10 p-3">
                  {selectedNicknamePreview.map((nickname) => (
                    <Badge key={nickname} variant="secondary" className="rounded-full px-3 py-1">
                      {nickname}
                    </Badge>
                  ))}
                  {remainingNicknameCount > 0 ? (
                    <Badge variant="outline" className="rounded-full px-3 py-1">
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
              className="max-h-[88dvh] rounded-t-[1.75rem] border-border/70 bg-background/98 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-4"
              data-floating-ai-avoid="true"
            >
              <SheetHeader className="pr-8 text-left">
                <SheetTitle>Collection Summary Filters</SheetTitle>
                <SheetDescription>
                  Adjust the year or limit the summary to selected staff nicknames. Changes refresh the summary automatically.
                </SheetDescription>
              </SheetHeader>

              <div className="mt-4 space-y-4 overflow-y-auto pr-1">
                <section className="space-y-4 rounded-2xl border border-border/60 bg-muted/10 p-4">
                  <div className="space-y-1">
                    <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
                      <CalendarRange className="h-4 w-4" />
                      Summary Scope
                    </h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Pick a reporting year first, then narrow the summary to one or more staff nicknames if needed.
                    </p>
                  </div>

                  <CollectionSummaryFilters {...viewModels.filters} />
                </section>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    className="h-11 rounded-2xl"
                    onClick={() => setMobileFiltersOpen(false)}
                  >
                    Done
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 rounded-2xl"
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
        <div className="ops-toolbar">
          <CollectionSummaryFilters {...viewModels.filters} />
        </div>
      )}

      <CollectionSummaryTable {...viewModels.table} />

      <CollectionSummaryTotals {...viewModels.totals} />

      {viewModels.monthDialog?.open ? (
        <Suspense fallback={null}>
          <CollectionMonthDetailsDialog {...viewModels.monthDialog} />
        </Suspense>
      ) : null}
    </OperationalSectionCard>
  );
}

const MemoizedCollectionSummaryPage = memo(CollectionSummaryPage);
MemoizedCollectionSummaryPage.displayName = "CollectionSummaryPage";

export default MemoizedCollectionSummaryPage;

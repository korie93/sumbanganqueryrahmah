import { lazy, memo, Suspense, useMemo, useState } from "react";
import { Filter, RotateCcw } from "lucide-react";
import { CollectionReportFreshnessBadge } from "@/components/collection-report/CollectionReportFreshnessBadge";
import { OperationalSectionCard } from "@/components/layout/OperationalPage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatIsoDateToDDMMYYYY } from "@/lib/date-format";
import { useCollectionNicknameSummaryData } from "@/pages/collection-nickname-summary/useCollectionNicknameSummaryData";
import { CollectionNicknameMultiSelect } from "@/pages/collection-report/CollectionNicknameMultiSelect";

const CollectionNicknameBatchSections = lazy(() =>
  import("@/pages/collection-nickname-summary/CollectionNicknameBatchSections").then((module) => ({
    default: module.CollectionNicknameBatchSections,
  })),
);

type CollectionNicknameSummaryPageProps = {
  role: string;
};

function CollectionNicknameSummaryIdleState() {
  return (
    <div className="rounded-md border border-dashed border-border/60 bg-background/40 px-4 py-6 text-sm text-muted-foreground">
      Pilih staff nickname dan julat tarikh, kemudian tekan Apply untuk lihat ringkasan kutipan.
    </div>
  );
}

function CollectionNicknameSummaryLoadingState() {
  return (
    <div className="rounded-md border border-border/60 bg-background/40 px-4 py-6 text-sm text-muted-foreground">
      Loading nickname summary...
    </div>
  );
}

function CollectionNicknameSummaryPage({ role }: CollectionNicknameSummaryPageProps) {
  const canAccess = role === "admin" || role === "superuser";
  const isMobile = useIsMobile();
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const summaryData = useCollectionNicknameSummaryData({ canAccess });
  const activeControlCount =
    (summaryData.selectedNicknames.length > 0 ? 1 : 0) +
    (summaryData.fromDate ? 1 : 0) +
    (summaryData.toDate ? 1 : 0);
  const canReset = activeControlCount > 0 || summaryData.hasApplied;
  const selectedNicknamePreview = useMemo(
    () => summaryData.selectedNicknames.slice(0, 2),
    [summaryData.selectedNicknames],
  );
  const remainingNicknameCount = summaryData.selectedNicknames.length - selectedNicknamePreview.length;
  const mobileDateRangeLabel = useMemo(() => {
    if (summaryData.fromDate && summaryData.toDate) {
      return `${formatIsoDateToDDMMYYYY(summaryData.fromDate)} - ${formatIsoDateToDDMMYYYY(summaryData.toDate)}`;
    }
    if (summaryData.fromDate) {
      return `From ${formatIsoDateToDDMMYYYY(summaryData.fromDate)}`;
    }
    if (summaryData.toDate) {
      return `To ${formatIsoDateToDDMMYYYY(summaryData.toDate)}`;
    }
    return "Choose a date range before applying the nickname summary.";
  }, [summaryData.fromDate, summaryData.toDate]);

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
        <>
          <div
            className="relative overflow-hidden rounded-[1.75rem] border border-border/60 bg-background/80 px-4 py-4 shadow-sm"
            data-floating-ai-avoid="true"
          >
            <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-br from-primary/12 via-primary/6 to-transparent" />
            <div className="relative space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Collection
                </p>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  Nickname Summary
                </h1>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Compare staff nickname performance from a calmer mobile summary view without leaving the current collection workspace.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  className="h-11 w-full justify-center rounded-2xl"
                  onClick={() => setMobileFiltersOpen(true)}
                >
                  <Filter className="mr-2 h-4 w-4" />
                  Summary Filters
                  {activeControlCount > 0 ? (
                    <Badge variant="secondary" className="ml-2 rounded-full px-2 py-0.5 text-[11px]">
                      {activeControlCount}
                    </Badge>
                  ) : null}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full rounded-2xl"
                  onClick={summaryData.reset}
                  disabled={!canReset || summaryData.loadingSummary}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reset
                </Button>
              </div>

              <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Current Selection
                    </p>
                    <p className="text-sm font-medium text-foreground">
                      {summaryData.selectedNicknames.length > 0
                        ? summaryData.selectedNicknameLabel
                        : "Choose staff nicknames to build a grouped collection summary."}
                    </p>
                  </div>
                  <Badge variant={summaryData.hasApplied ? "default" : "secondary"} className="rounded-full">
                    {summaryData.hasApplied ? "Applied" : "Pending"}
                  </Badge>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1 rounded-2xl border border-border/60 bg-background/70 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Staff Nickname
                    </p>
                    <p className="text-sm leading-relaxed text-foreground">
                      {summaryData.selectedNicknames.length > 0
                        ? summaryData.selectedNicknameLabel
                        : "No nickname selected yet."}
                    </p>
                  </div>
                  <div className="space-y-1 rounded-2xl border border-border/60 bg-background/70 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Date Range
                    </p>
                    <p className="text-sm leading-relaxed text-foreground">{mobileDateRangeLabel}</p>
                  </div>
                </div>

                {selectedNicknamePreview.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
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
          </div>

          <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
            <SheetContent
              side="bottom"
              className="max-h-[88dvh] rounded-t-[1.75rem] border-border/70 bg-background/98 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-4"
              data-floating-ai-avoid="true"
            >
              <SheetHeader className="pr-8 text-left">
                <SheetTitle>Nickname Summary Filters</SheetTitle>
                <SheetDescription>
                  Choose the staff nicknames and date range before applying the grouped collection summary.
                </SheetDescription>
              </SheetHeader>

              <div className="mt-4 space-y-4 overflow-y-auto pr-1">
                <section className="space-y-4 rounded-2xl border border-border/60 bg-muted/10 p-4">
                  <div className="space-y-1">
                    <h3 className="text-base font-semibold text-foreground">Nickname Scope</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Pick one or more staff nicknames to compare total records and collection amounts.
                    </p>
                  </div>

                  <CollectionNicknameMultiSelect
                    label="Staff Nickname"
                    open={summaryData.nicknameDropdownOpen}
                    loading={summaryData.loadingNicknames || summaryData.loadingSummary}
                    selectedLabel={summaryData.selectedNicknameLabel}
                    options={summaryData.nicknameOptions}
                    selectedNicknameSet={summaryData.selectedNicknameSet}
                    allSelected={summaryData.allSelected}
                    partiallySelected={summaryData.partiallySelected}
                    selectedCount={summaryData.selectedNicknames.length}
                    onOpenChange={summaryData.setNicknameDropdownOpen}
                    onToggleNickname={summaryData.toggleNickname}
                    onSelectAllVisible={summaryData.selectAllVisible}
                    onClearAllSelected={summaryData.clearAllSelected}
                    triggerClassName="h-12 rounded-2xl bg-background/95"
                    popoverClassName="w-[min(360px,calc(100vw-3rem))] rounded-2xl border-border/70 bg-popover/98 shadow-lg"
                  />
                </section>

                <section className="space-y-4 rounded-2xl border border-border/60 bg-muted/10 p-4">
                  <div className="space-y-1">
                    <h3 className="text-base font-semibold text-foreground">Date Range</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Select a start and end date before loading the summary.
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>From Date</Label>
                      <DatePickerField
                        value={summaryData.fromDate}
                        onChange={summaryData.setFromDate}
                        placeholder="Select from date..."
                        ariaLabel="From Date"
                        buttonTestId="collection-nickname-summary-from-date"
                        className="h-12 rounded-2xl"
                        contentClassName="rounded-2xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>To Date</Label>
                      <DatePickerField
                        value={summaryData.toDate}
                        onChange={summaryData.setToDate}
                        placeholder="Select to date..."
                        ariaLabel="To Date"
                        buttonTestId="collection-nickname-summary-to-date"
                        className="h-12 rounded-2xl"
                        contentClassName="rounded-2xl"
                      />
                    </div>
                  </div>
                </section>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    className="h-11 rounded-2xl"
                    onClick={() => {
                      void summaryData.apply();
                    }}
                    disabled={summaryData.loadingSummary || summaryData.loadingNicknames}
                  >
                    {summaryData.loadingSummary ? "Loading..." : "Apply"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 rounded-2xl"
                    onClick={() => {
                      summaryData.reset();
                      setMobileFiltersOpen(false);
                    }}
                    disabled={summaryData.loadingSummary}
                  >
                    Reset
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </>
      ) : (
        <div className="ops-toolbar" data-floating-ai-avoid="true">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_180px_180px_auto] xl:items-end">
            <CollectionNicknameMultiSelect
              label="Staff Nickname"
              open={summaryData.nicknameDropdownOpen}
              loading={summaryData.loadingNicknames || summaryData.loadingSummary}
              selectedLabel={summaryData.selectedNicknameLabel}
              options={summaryData.nicknameOptions}
              selectedNicknameSet={summaryData.selectedNicknameSet}
              allSelected={summaryData.allSelected}
              partiallySelected={summaryData.partiallySelected}
              selectedCount={summaryData.selectedNicknames.length}
              onOpenChange={summaryData.setNicknameDropdownOpen}
              onToggleNickname={summaryData.toggleNickname}
              onSelectAllVisible={summaryData.selectAllVisible}
              onClearAllSelected={summaryData.clearAllSelected}
            />

            <div className="space-y-1">
              <Label>From Date</Label>
              <DatePickerField
                value={summaryData.fromDate}
                onChange={summaryData.setFromDate}
                placeholder="Select from date..."
                ariaLabel="From Date"
                buttonTestId="collection-nickname-summary-from-date"
              />
            </div>

            <div className="space-y-1">
              <Label>To Date</Label>
              <DatePickerField
                value={summaryData.toDate}
                onChange={summaryData.setToDate}
                placeholder="Select to date..."
                ariaLabel="To Date"
                buttonTestId="collection-nickname-summary-to-date"
              />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap" data-floating-ai-avoid="true">
              <Button
                onClick={() => void summaryData.apply()}
                disabled={summaryData.loadingSummary || summaryData.loadingNicknames}
              >
                {summaryData.loadingSummary ? "Loading..." : "Apply"}
              </Button>
              <Button
                variant="outline"
                onClick={summaryData.reset}
                disabled={summaryData.loadingSummary}
              >
                Reset
              </Button>
            </div>
          </div>
        </div>
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

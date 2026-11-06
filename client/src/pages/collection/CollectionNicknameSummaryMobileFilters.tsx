import { Filter, RotateCcw } from "lucide-react";
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
  SheetTrigger,
} from "@/components/ui/sheet";
import { CollectionNicknameMultiSelect } from "@/pages/collection-report/CollectionNicknameMultiSelect";
import type { CollectionNicknameSummaryData } from "./collection-nickname-summary-page-shared";
import { hasCollectionNicknameSummaryDraftChanges } from "./collection-nickname-summary-page-utils";
import { CollectionNicknameSummaryFilterStatus } from "./CollectionNicknameSummaryFilterStatus";

type CollectionNicknameSummaryMobileFiltersProps = {
  summaryData: CollectionNicknameSummaryData;
  activeControlCount: number;
  canReset: boolean;
  mobileFiltersOpen: boolean;
  mobileDateRangeLabel: string;
  selectedNicknamePreview: string[];
  remainingNicknameCount: number;
  setMobileFiltersOpen: (open: boolean) => void;
};

export function CollectionNicknameSummaryMobileFilters({
  summaryData,
  activeControlCount,
  canReset,
  mobileFiltersOpen,
  mobileDateRangeLabel,
  selectedNicknamePreview,
  remainingNicknameCount,
  setMobileFiltersOpen,
}: CollectionNicknameSummaryMobileFiltersProps) {
  const fromDateButtonId = "collection-nickname-summary-mobile-from-date-button";
  const toDateButtonId = "collection-nickname-summary-mobile-to-date-button";
  const hasDraftChanges = hasCollectionNicknameSummaryDraftChanges(summaryData);

  return (
    <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
      <div
        className="min-w-0 space-y-4"
        data-floating-ai-avoid="true"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-stretch gap-2">
            <SheetTrigger asChild>
            <Button
              type="button"
              className="h-auto min-h-11 min-w-0 flex-1 justify-center whitespace-normal rounded-lg"
              aria-haspopup="dialog"
            >
              <Filter className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Summary Filters</span>
              {activeControlCount > 0 ? (
                <Badge variant="secondary" className="ml-2 rounded-full px-2 py-0.5 text-2xs">
                  {activeControlCount}
                </Badge>
              ) : null}
            </Button>
            </SheetTrigger>
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-11 shrink-0 rounded-lg"
              onClick={summaryData.reset}
              disabled={!canReset || summaryData.loadingSummary}
            >
              <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
              Reset
            </Button>
          </div>

          <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/10 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-label-md text-muted-foreground">
                  Draft selection
                </p>
                <p className="text-sm font-medium text-foreground">
                  {summaryData.selectedNicknames.length > 0
                    ? summaryData.selectedNicknameLabel
                    : "Choose staff nicknames to build a grouped collection summary."}
                </p>
              </div>
              <Badge variant={summaryData.hasApplied && !hasDraftChanges ? "default" : "secondary"} className="rounded-full">
                {hasDraftChanges ? "Unapplied changes" : summaryData.hasApplied ? "Applied" : "Pending"}
              </Badge>
            </div>

            <CollectionNicknameSummaryFilterStatus selection={summaryData} />

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 rounded-2xl border border-border/60 bg-background/70 p-3">
                <p className="text-2xs font-semibold uppercase tracking-label-md text-muted-foreground">
                  Staff Nickname
                </p>
                <p className="text-sm leading-relaxed text-foreground">
                  {summaryData.selectedNicknames.length > 0
                    ? summaryData.selectedNicknameLabel
                    : "No nickname selected yet."}
                </p>
              </div>
              <div className="space-y-1 rounded-2xl border border-border/60 bg-background/70 p-3">
                <p className="text-2xs font-semibold uppercase tracking-label-md text-muted-foreground">
                  Date Range
                </p>
                <p className="text-sm leading-relaxed text-foreground">{mobileDateRangeLabel}</p>
              </div>
            </div>

            {selectedNicknamePreview.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {selectedNicknamePreview.map((nickname) => (
                  <Badge key={nickname} variant="secondary" className="max-w-full whitespace-normal [overflow-wrap:anywhere] rounded-full px-3 py-1">
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

        <SheetContent
          side="bottom"
          className="rounded-t-[1.75rem] border-border/70 bg-background/98 px-4 pb-[calc(var(--safe-area-inset-bottom)+1rem)] pt-4"
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
                  <Label htmlFor={fromDateButtonId}>From Date</Label>
                  <DatePickerField
                    buttonId={fromDateButtonId}
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
                  <Label htmlFor={toDateButtonId}>To Date</Label>
                  <DatePickerField
                    buttonId={toDateButtonId}
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
  );
}

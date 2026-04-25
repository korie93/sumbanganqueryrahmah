import { Suspense } from "react";
import { HorizontalScrollHint } from "@/components/HorizontalScrollHint";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GeneralSearchExportMenu } from "@/pages/general-search/GeneralSearchExportMenu";

interface GeneralSearchResultsToolbarProps {
  activeFilterSummaries: string[];
  advancedMode: boolean;
  canExport: boolean;
  exportingPdf: boolean;
  filtersCount: number;
  isMobile: boolean;
  logic: "AND" | "OR";
  onExportCsv: () => void;
  onExportPdf: () => void;
  onRowsPerPageChange: (rowsPerPage: number) => void;
  pageSizeOptions: number[];
  query: string;
  resultsLength: number;
  resultsPerPage: number;
  totalResults: number;
  totalResultsIsApproximate: boolean;
}

export function GeneralSearchResultsToolbar({
  activeFilterSummaries,
  advancedMode,
  canExport,
  exportingPdf,
  filtersCount,
  isMobile,
  logic,
  onExportCsv,
  onExportPdf,
  onRowsPerPageChange,
  pageSizeOptions,
  query,
  resultsLength,
  resultsPerPage,
  totalResults,
  totalResultsIsApproximate,
}: GeneralSearchResultsToolbarProps) {
  const trimmedQuery = query.trim();
  const resultCountPrefix = totalResultsIsApproximate ? "At least " : "";
  const mobileSummaryChips = advancedMode
    ? activeFilterSummaries
    : trimmedQuery
      ? [`Keyword • ${trimmedQuery}`]
      : [];

  if (isMobile) {
    return (
      <div className="mb-4 space-y-3">
        <div className="min-w-0 space-y-3">
          <p className="text-foreground font-medium">
            {resultCountPrefix}{totalResults} result{totalResults === 1 ? "" : "s"} found
          </p>
          {advancedMode ? (
            <p className="text-sm text-muted-foreground">
              {filtersCount} active filters with {logic} logic
            </p>
          ) : null}
          {mobileSummaryChips.length > 0 ? (
            <HorizontalScrollHint
              viewportClassName="-mx-1 flex gap-2 px-1 pb-1"
              hint="Swipe summaries"
            >
              {mobileSummaryChips.slice(0, 5).map((summary) => (
                <div
                  key={summary}
                  className="shrink-0 rounded-full border border-border/60 bg-muted/30 px-3 py-1 text-xs text-foreground"
                >
                  {summary}
                </div>
              ))}
              {mobileSummaryChips.length > 5 ? (
                <div className="shrink-0 rounded-full border border-border/60 bg-background px-3 py-1 text-xs text-muted-foreground">
                  +{mobileSummaryChips.length - 5} more
                </div>
              ) : null}
            </HorizontalScrollHint>
          ) : null}
        </div>

        <details className="rounded-2xl border border-border/60 bg-background/70">
          <summary className="cursor-pointer list-none px-3 py-3 text-sm font-medium text-foreground">
            Result tools
          </summary>
          <div className="space-y-3 border-t border-border/60 px-3 pb-3 pt-3">
            <div className="grid grid-cols-1 gap-2 text-sm text-muted-foreground">
              <span>Rows per page</span>
              <Select
                value={String(resultsPerPage)}
                onValueChange={(value) => onRowsPerPageChange(Number(value))}
              >
                <SelectTrigger className="h-10 w-full" data-testid="select-rows-per-page">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pageSizeOptions.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {canExport ? (
              <Suspense
                fallback={
                  <Button variant="outline" size="sm" disabled className="w-full">
                    Export
                  </Button>
                }
              >
                <GeneralSearchExportMenu
                  exportingPdf={exportingPdf}
                  totalResults={totalResults}
                  visibleResultsCount={resultsLength}
                  onExportCsv={onExportCsv}
                  onExportPdf={onExportPdf}
                />
              </Suspense>
            ) : null}
          </div>
        </details>
      </div>
    );
  }

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 space-y-3">
        <p className="text-foreground font-medium">
          {resultCountPrefix}{totalResults} result{totalResults === 1 ? "" : "s"} found
        </p>
        {advancedMode ? (
          <p className="text-sm text-muted-foreground">
            {filtersCount} active filters with {logic} logic
          </p>
        ) : null}
      </div>

      <div className="flex items-center flex-wrap gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Rows per page</span>
          <Select
            value={String(resultsPerPage)}
            onValueChange={(value) => onRowsPerPageChange(Number(value))}
          >
            <SelectTrigger className="w-[110px]" data-testid="select-rows-per-page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {canExport ? (
          <Suspense
            fallback={
              <Button variant="outline" size="sm" disabled className="w-full sm:w-auto">
                Export
              </Button>
            }
          >
            <GeneralSearchExportMenu
              exportingPdf={exportingPdf}
              totalResults={totalResults}
              visibleResultsCount={resultsLength}
              onExportCsv={onExportCsv}
              onExportPdf={onExportPdf}
            />
          </Suspense>
        ) : null}
      </div>
    </div>
  );
}

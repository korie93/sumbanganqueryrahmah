import type { ReactNode } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SearchResultRow } from "@/pages/general-search/types";
import {
  getGeneralSearchPopulatedHeaders,
} from "@/pages/general-search/general-search-results-utils";
import { getCellDisplayText, getPriorityRank } from "@/pages/general-search/utils";

interface GeneralSearchMobileResultsListProps {
  headers: string[];
  onRecordSelect: (record: SearchResultRow) => void;
  rangeStart: number;
  renderCellValue: (safeText: string) => ReactNode;
  results: SearchResultRow[];
}

export function GeneralSearchMobileResultsList({
  headers,
  onRecordSelect,
  rangeStart,
  renderCellValue,
  results,
}: GeneralSearchMobileResultsListProps) {
  return (
    <div className="space-y-3">
      {results.map((row, rowIndex) => {
        const resultNumber = rangeStart + rowIndex;
        const populatedHeaders = getGeneralSearchPopulatedHeaders(headers, row);
        const headlineHeader = populatedHeaders[0];
        const subheadlineHeader = populatedHeaders[1];
        const visibleDetailHeaders = populatedHeaders.slice(2, 5);
        const overflowHeaders = populatedHeaders.slice(5);
        const headlineValue = headlineHeader ? getCellDisplayText(row?.[headlineHeader]) : "-";
        const subheadlineValue = subheadlineHeader ? getCellDisplayText(row?.[subheadlineHeader]) : "";

        return (
          <article
            key={`mobile-result-${resultNumber}`}
            className="rounded-2xl border border-border/60 bg-background/80 p-3 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Result {resultNumber}
                </p>
                <div className="break-words text-base font-semibold text-foreground">
                  {renderCellValue(headlineValue)}
                </div>
                {subheadlineHeader && subheadlineValue && subheadlineValue !== "-" ? (
                  <p className="break-words text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{subheadlineHeader}:</span>{" "}
                    {renderCellValue(subheadlineValue)}
                  </p>
                ) : null}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => onRecordSelect(row)}
                className="h-10 shrink-0 px-3"
                data-testid={`button-view-${rowIndex}`}
              >
                <Eye className="mr-2 h-4 w-4" />
                View
              </Button>
            </div>

            {visibleDetailHeaders.length > 0 ? (
              <dl className="mt-3 space-y-2">
                {visibleDetailHeaders.map((header) => {
                  const safeText = getCellDisplayText(row?.[header]);
                  return (
                    <div
                      key={`${resultNumber}-${header}`}
                      className="rounded-xl border border-border/50 bg-muted/30 px-3 py-2"
                    >
                      <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                        {header}
                      </dt>
                      <dd
                        className={`mt-1 break-words text-sm text-foreground ${
                          getPriorityRank(header) <= 2 ? "font-semibold" : ""
                        }`}
                      >
                        {renderCellValue(safeText)}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            ) : null}

            {overflowHeaders.length > 0 ? (
              <details className="mt-3 rounded-xl border border-border/50 bg-background/70">
                <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-primary">
                  Show {overflowHeaders.length} more field{overflowHeaders.length === 1 ? "" : "s"}
                </summary>
                <dl className="space-y-2 border-t border-border/50 px-3 py-3">
                  {overflowHeaders.map((header) => {
                    const safeText = getCellDisplayText(row?.[header]);
                    return (
                      <div
                        key={`${resultNumber}-${header}-extra`}
                        className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2"
                      >
                        <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                          {header}
                        </dt>
                        <dd className="mt-1 break-words text-sm text-foreground">
                          {renderCellValue(safeText)}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </details>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

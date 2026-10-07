import { useEffect, useRef, useState, type ReactNode, type UIEvent } from "react";
import { Eye } from "lucide-react";
import { HorizontalScrollHint } from "@/components/HorizontalScrollHint";
import { Button } from "@/components/ui/button";
import { GeneralSearchCollectionStatus } from "@/pages/general-search/GeneralSearchCollectionStatus";
import { buildGeneralSearchRowAriaLabel } from "@/pages/general-search/general-search-row-aria";
import type { SearchResultRow } from "@/pages/general-search/types";
import { getCellDisplayText, getPriorityRank } from "@/pages/general-search/utils";
import { buildGeneralSearchVirtualRowsState, DEFAULT_GENERAL_SEARCH_VIEWPORT_HEIGHT_PX } from "@/pages/general-search/general-search-results-utils";

interface GeneralSearchDesktopResultsTableProps {
  currentPage: number;
  resultsPerPage: number;
  canSeeSourceFile: boolean;
  isLowSpecMode: boolean;
  headers: string[];
  onRecordSelect: (record: SearchResultRow) => void;
  renderCellValue: (safeText: string) => ReactNode;
  results: SearchResultRow[];
}

export function GeneralSearchDesktopResultsTable({
  currentPage,
  resultsPerPage,
  canSeeSourceFile,
  isLowSpecMode,
  headers,
  onRecordSelect,
  renderCellValue,
  results,
}: GeneralSearchDesktopResultsTableProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLTableSectionElement>(null);
  const [firstRow, setFirstRow] = useState<HTMLTableRowElement | null>(null);
  const [tableScrollTop, setTableScrollTop] = useState(0);
  const [metrics, setMetrics] = useState({
    viewportHeight: DEFAULT_GENERAL_SEARCH_VIEWPORT_HEIGHT_PX, rowHeight: 52, headerHeight: 0,
  });

  useEffect(() => {
    // Reset the actual scroller as well as the virtual window when pages change.
    if (viewportRef.current) viewportRef.current.scrollTop = 0;
    setTableScrollTop(0);
  }, [currentPage, results, resultsPerPage]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const header = headerRef.current;
    if (!viewport || !header || !firstRow) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const next = {
        viewportHeight: viewport.clientHeight,
        rowHeight: firstRow.getBoundingClientRect().height,
        headerHeight: header.getBoundingClientRect().height,
      };
      if (next.viewportHeight <= 0 || next.rowHeight <= 0) return;
      setMetrics((previous) => previous.viewportHeight === next.viewportHeight
        && previous.rowHeight === next.rowHeight && previous.headerHeight === next.headerHeight ? previous : next);
      setTableScrollTop(viewport.scrollTop);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    schedule();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
    observer?.observe(viewport);
    observer?.observe(header);
    observer?.observe(firstRow);
    window.addEventListener("resize", schedule);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [firstRow]);

  const { bottomSpacerHeight, enableVirtualRows, topSpacerHeight, virtualEndRow, virtualStartRow } =
    buildGeneralSearchVirtualRowsState(results.length, isLowSpecMode, tableScrollTop,
      metrics.viewportHeight, metrics.rowHeight, metrics.headerHeight);
  const virtualRows = enableVirtualRows ? results.slice(virtualStartRow, virtualEndRow) : results;
  const buildRowKey = (row: SearchResultRow, rowNumber: number) => {
    const explicitId = row.id ?? row.ID ?? row.recordId ?? row.record_id;
    if (typeof explicitId === "string" || typeof explicitId === "number") {
      return `search-result-${explicitId}`;
    }

    const visibleFingerprint = headers
      .slice(0, 4)
      .map((header) => getCellDisplayText(row?.[header]))
      .join("|");

    return `search-result-${rowNumber}-${visibleFingerprint}`;
  };

  return (
    <HorizontalScrollHint
      ariaLabel="General search result columns"
      className="rounded-lg border border-border"
      hint="Scroll columns"
      navigationLabel="General search table column navigation"
      showNavigationControls
      showScrollbar
      viewportClassName={`general-search-results-viewport overflow-y-auto scroll-fade-y${enableVirtualRows ? " general-search-results-viewport--virtual" : ""}`}
      viewportRef={viewportRef}
      {...(enableVirtualRows ? { onScroll: (event: UIEvent<HTMLDivElement>) => setTableScrollTop(event.currentTarget.scrollTop) } : {})}
    >
      <table className="w-full text-sm">
        <thead ref={headerRef} className="sticky top-0 bg-muted">
          <tr>
            <th scope="col" className="p-3 text-left font-medium text-muted-foreground">#</th>
            <th scope="col" className="p-3 text-left font-medium text-muted-foreground">Action</th>
            <th scope="col" className="p-3 text-left font-medium text-muted-foreground">Collection</th>
            {headers.map((header) => (
              <th key={header} scope="col" className="whitespace-nowrap p-3 text-left font-medium text-muted-foreground">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {enableVirtualRows && topSpacerHeight > 0 ? (
            <tr aria-hidden="true">
              <td aria-hidden="true" colSpan={headers.length + 3} style={{ height: topSpacerHeight }} className="p-0" />
            </tr>
          ) : null}
          {virtualRows.map((row, rowIndex) => {
            const actualRowIndex = enableVirtualRows ? virtualStartRow + rowIndex : rowIndex;
            const rowAriaLabel = buildGeneralSearchRowAriaLabel({
              headers,
              resultNumber: actualRowIndex + 1,
              row,
            });

            return (
              <tr
                key={buildRowKey(row, actualRowIndex)}
                ref={rowIndex === 0 ? setFirstRow : undefined}
                aria-label={rowAriaLabel}
                className="h-[52px] border-t border-border hover:bg-muted/50"
              >
                <td className="px-3 py-2 text-muted-foreground">{actualRowIndex + 1}</td>
                <td className="px-3 py-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRecordSelect(row)}
                    data-testid={`button-view-${actualRowIndex}`}
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    View
                  </Button>
                </td>
                <td className="px-3 py-2 align-middle">
                  <GeneralSearchCollectionStatus
                    compact
                    canSeeSourceFile={canSeeSourceFile}
                    row={row}
                  />
                </td>
                {headers.map((header) => {
                  const safeText = getCellDisplayText(row?.[header]);
                  return (
                    <td
                      key={`${actualRowIndex}-${header}`}
                      className={`max-w-[280px] truncate whitespace-nowrap px-3 py-2 text-foreground ${
                        getPriorityRank(header) <= 2 ? "font-semibold" : ""
                      }`}
                      title={safeText}
                    >
                      {renderCellValue(safeText)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {enableVirtualRows && bottomSpacerHeight > 0 ? (
            <tr aria-hidden="true">
              <td aria-hidden="true" colSpan={headers.length + 3} style={{ height: bottomSpacerHeight }} className="p-0" />
            </tr>
          ) : null}
        </tbody>
      </table>
    </HorizontalScrollHint>
  );
}

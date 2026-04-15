import { Suspense, useLayoutEffect, useMemo, useRef } from "react";
import { HorizontalScrollHint } from "@/components/HorizontalScrollHint";
import { useIsMobile } from "@/hooks/use-mobile";
import { lazyWithPreload } from "@/lib/lazy-with-preload";
import type { DataRowWithId, ViewerVirtualRowData } from "@/pages/viewer/types";
import { ViewerDataTableFeedback } from "@/pages/viewer/ViewerDataTableFeedback";

const ViewerMobileCardsTable = lazyWithPreload(() =>
  import("@/pages/viewer/ViewerMobileCardsTable").then((module) => ({
    default: module.ViewerMobileCardsTable,
  })),
);
const ViewerStandardTable = lazyWithPreload(() =>
  import("@/pages/viewer/ViewerStandardTable").then((module) => ({
    default: module.ViewerStandardTable,
  })),
);
const ViewerVirtualizedTable = lazyWithPreload(() =>
  import("@/pages/viewer/ViewerVirtualizedTable").then((module) => ({
    default: module.ViewerVirtualizedTable,
  })),
);

interface ViewerDataTableProps {
  debouncedSearch: string;
  enableVirtualRows: boolean;
  filteredRows: DataRowWithId[];
  gridTemplateColumns: string;
  minSearchLength: number;
  onToggleRowSelection: (rowId: number) => void;
  onToggleSelectAllFiltered: () => void;
  rowHeightPx: number;
  selectedRowIds: Set<number>;
  selectAllFiltered: boolean;
  virtualTableMinWidth: number;
  viewportHeightPx: number;
  visibleHeaders: string[];
}

export function ViewerDataTable({
  debouncedSearch,
  enableVirtualRows,
  filteredRows,
  gridTemplateColumns,
  minSearchLength,
  onToggleRowSelection,
  onToggleSelectAllFiltered,
  rowHeightPx,
  selectedRowIds,
  selectAllFiltered,
  virtualTableMinWidth,
  viewportHeightPx,
  visibleHeaders,
}: ViewerDataTableProps) {
  const isMobile = useIsMobile();
  const virtualTableWidthRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    virtualTableWidthRef.current?.style.setProperty(
      "--viewer-table-min-width",
      `${virtualTableMinWidth}px`,
    );
  }, [virtualTableMinWidth]);

  const virtualRowData = useMemo<ViewerVirtualRowData>(
    () => ({
      rows: filteredRows,
      visibleHeaders,
      selectedRowIds,
      onToggleRowSelection,
      gridTemplateColumns,
    }),
    [filteredRows, gridTemplateColumns, onToggleRowSelection, selectedRowIds, visibleHeaders],
  );

  const desktopTableFallback = (
    <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-border/60 bg-background/60">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
    </div>
  );
  const mobileTableFallback = (
    <div className="space-y-3">
      <div className="h-12 animate-pulse rounded-xl border border-border/60 bg-background/60" />
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={`viewer-mobile-card-fallback-${index}`}
          className="h-40 animate-pulse rounded-2xl border border-border/60 bg-background/60"
        />
      ))}
    </div>
  );

  return (
    <div className="ops-table-shell">
      <HorizontalScrollHint hint="Scroll columns">
        {isMobile ? (
          <Suspense fallback={mobileTableFallback}>
            <ViewerMobileCardsTable
              filteredRows={filteredRows}
              onToggleRowSelection={onToggleRowSelection}
              onToggleSelectAllFiltered={onToggleSelectAllFiltered}
              selectedRowIds={selectedRowIds}
              selectAllFiltered={selectAllFiltered}
              visibleHeaders={visibleHeaders}
            />
          </Suspense>
        ) : enableVirtualRows ? (
          <Suspense fallback={desktopTableFallback}>
            <ViewerVirtualizedTable
              filteredRows={filteredRows}
              gridTemplateColumns={gridTemplateColumns}
              onToggleRowSelection={onToggleRowSelection}
              onToggleSelectAllFiltered={onToggleSelectAllFiltered}
              rowHeightPx={rowHeightPx}
              selectedRowIds={selectedRowIds}
              selectAllFiltered={selectAllFiltered}
              virtualRowData={virtualRowData}
              viewportHeightPx={viewportHeightPx}
              virtualTableWidthRef={virtualTableWidthRef}
              visibleHeaders={visibleHeaders}
            />
          </Suspense>
        ) : (
          <Suspense fallback={desktopTableFallback}>
            <ViewerStandardTable
              filteredRows={filteredRows}
              onToggleRowSelection={onToggleRowSelection}
              onToggleSelectAllFiltered={onToggleSelectAllFiltered}
              selectedRowIds={selectedRowIds}
              selectAllFiltered={selectAllFiltered}
              visibleHeaders={visibleHeaders}
            />
          </Suspense>
        )}
      </HorizontalScrollHint>

      <ViewerDataTableFeedback
        debouncedSearch={debouncedSearch}
        filteredRowsCount={filteredRows.length}
        minSearchLength={minSearchLength}
      />
    </div>
  );
}

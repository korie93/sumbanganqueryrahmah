import { Suspense, lazy, memo, useLayoutEffect, useMemo, useRef } from "react";
import { HorizontalScrollHint } from "@/components/HorizontalScrollHint";
import { useIsMobile } from "@/hooks/use-mobile";
import type { TableDensity } from "@/hooks/usePersistentTableDensity";
import type { DataRowWithId, ViewerVirtualRowData } from "@/pages/viewer/types";
import { ViewerDataTableFeedback } from "@/pages/viewer/ViewerDataTableFeedback";
import styles from "./ViewerDataTable.module.css";

const ViewerMobileCardsTable = lazy(() =>
  import("@/pages/viewer/ViewerMobileCardsTable").then((module) => ({
    default: module.ViewerMobileCardsTable,
  })),
);
const ViewerStandardTable = lazy(() =>
  import("@/pages/viewer/ViewerStandardTable").then((module) => ({
    default: module.ViewerStandardTable,
  })),
);
const ViewerVirtualizedTable = lazy(() =>
  import("@/pages/viewer/ViewerVirtualizedTable").then((module) => ({
    default: module.ViewerVirtualizedTable,
  })),
);

const VIEWER_MOBILE_CARD_FALLBACK_KEYS = [
  "first-card",
  "second-card",
  "third-card",
] as const;

interface ViewerDataTableProps {
  debouncedSearch: string;
  enableVirtualRows: boolean;
  filteredRows: DataRowWithId[];
  gridTemplateColumns: string;
  tableDensity: TableDensity;
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

function ViewerDataTableImpl({
  debouncedSearch,
  enableVirtualRows,
  filteredRows,
  gridTemplateColumns,
  tableDensity,
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
  const desktopTableWidthRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    desktopTableWidthRef.current?.style.setProperty(
      "--viewer-table-min-width",
      `${virtualTableMinWidth}px`,
    );
  }, [virtualTableMinWidth]);

  const virtualRowData = useMemo<ViewerVirtualRowData>(
    () => ({
      density: tableDensity,
      rows: filteredRows,
      visibleHeaders,
      selectedRowIds,
      onToggleRowSelection,
      gridTemplateColumns,
    }),
    [filteredRows, gridTemplateColumns, onToggleRowSelection, selectedRowIds, tableDensity, visibleHeaders],
  );

  const desktopTableFallback = useMemo(
    () => (
      <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-border/60 bg-background/60">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      </div>
    ),
    [],
  );
  const mobileTableFallback = useMemo(
    () => (
      <div className="space-y-3">
        <div className="h-12 animate-pulse rounded-xl border border-border/60 bg-background/60" />
        {VIEWER_MOBILE_CARD_FALLBACK_KEYS.map((fallbackKey) => (
          <div
            key={fallbackKey}
            className="h-40 animate-pulse rounded-2xl border border-border/60 bg-background/60"
          />
        ))}
      </div>
    ),
    [],
  );

  return (
    <div className="ops-table-shell min-w-0">
      <HorizontalScrollHint
        ariaLabel="Viewer data columns"
        hint="Scroll columns"
        navigationLabel="Viewer table column navigation"
        showNavigationControls
        showScrollbar
        viewportClassName="overscroll-x-contain pb-2"
      >
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
        ) : (
          <div ref={desktopTableWidthRef} className={styles.desktopTableWidth}>
            {enableVirtualRows ? (
              <Suspense fallback={desktopTableFallback}>
                <ViewerVirtualizedTable
                  filteredRows={filteredRows}
                  gridTemplateColumns={gridTemplateColumns}
                  density={tableDensity}
                  onToggleRowSelection={onToggleRowSelection}
                  onToggleSelectAllFiltered={onToggleSelectAllFiltered}
                  rowHeightPx={rowHeightPx}
                  selectedRowIds={selectedRowIds}
                  selectAllFiltered={selectAllFiltered}
                  virtualRowData={virtualRowData}
                  viewportHeightPx={viewportHeightPx}
                  visibleHeaders={visibleHeaders}
                />
              </Suspense>
            ) : (
              <Suspense fallback={desktopTableFallback}>
                <ViewerStandardTable
                  filteredRows={filteredRows}
                  density={tableDensity}
                  onToggleRowSelection={onToggleRowSelection}
                  onToggleSelectAllFiltered={onToggleSelectAllFiltered}
                  selectedRowIds={selectedRowIds}
                  selectAllFiltered={selectAllFiltered}
                  visibleHeaders={visibleHeaders}
                />
              </Suspense>
            )}
          </div>
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

export const ViewerDataTable = memo(ViewerDataTableImpl);

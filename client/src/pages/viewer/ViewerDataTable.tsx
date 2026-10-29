import { Suspense, lazy, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type UIEvent } from "react";
import { HorizontalScrollHint } from "@/components/HorizontalScrollHint";
import { useIsMobile } from "@/hooks/use-mobile";
import type { TableDensity } from "@/hooks/usePersistentTableDensity";
import type { DataRowWithId, ViewerVirtualRowData } from "@/pages/viewer/types";
import { ViewerDataTableFeedback } from "@/pages/viewer/ViewerDataTableFeedback";
import { getViewerTableLayout } from "@/pages/viewer/viewer-column-presentation";
import { getViewerDesktopHeaders, resolveViewerPinnedColumn } from "@/pages/viewer/viewer-pinned-column";
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
const ViewerRowDetails = lazy(() =>
  import("@/pages/viewer/ViewerRowDetails").then((module) => ({ default: module.ViewerRowDetails })),
);

const VIEWER_MOBILE_CARD_FALLBACK_KEYS = [
  "first-card",
  "second-card",
  "third-card",
] as const;

interface ViewerDataTableProps {
  allHeaders?: string[] | undefined;
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
  pinnedColumn?: string | null | undefined;
}

function ViewerDataTableImpl({
  allHeaders,
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
  pinnedColumn,
}: ViewerDataTableProps) {
  const isMobile = useIsMobile();
  const desktopTableWidthRef = useRef<HTMLDivElement | null>(null);
  const horizontalViewportRef = useRef<HTMLDivElement>(null);
  const desktopPinnedColumn = isMobile ? null : resolveViewerPinnedColumn(pinnedColumn, visibleHeaders);
  const desktopHeaders = useMemo(
    () => getViewerDesktopHeaders(visibleHeaders, desktopPinnedColumn),
    [desktopPinnedColumn, visibleHeaders],
  );
  const desktopLayout = useMemo(
    () => desktopPinnedColumn !== null
      ? getViewerTableLayout(desktopHeaders, tableDensity)
      : { gridTemplateColumns, minWidth: virtualTableMinWidth },
    [desktopHeaders, desktopPinnedColumn, gridTemplateColumns, tableDensity, virtualTableMinWidth],
  );
  const handleHorizontalScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    if (desktopPinnedColumn === null) return;
    desktopTableWidthRef.current?.style.setProperty(
      "--viewer-pinned-scroll-left",
      `${Math.max(0, event.currentTarget.scrollLeft)}px`,
    );
  }, [desktopPinnedColumn]);
  const detailsTriggerRef = useRef<HTMLElement | null>(null);
  const [inspectedRow, setInspectedRow] = useState<DataRowWithId | null>(null);
  const handleInspectRow = useCallback((row: DataRowWithId) => {
    detailsTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setInspectedRow(row);
  }, []);
  const handleDetailsOpenChange = useCallback((open: boolean) => {
    if (!open) setInspectedRow(null);
  }, []);
  const handleDetailsCloseAutoFocus = useCallback((event: Event) => {
    if (detailsTriggerRef.current?.isConnected) {
      event.preventDefault();
      detailsTriggerRef.current.focus({ preventScroll: true });
    }
  }, []);

  useEffect(() => {
    // A search/page change must not leave an old record open in the new result set.
    setInspectedRow(null);
  }, [filteredRows]);

  useLayoutEffect(() => {
    const tableNode = desktopTableWidthRef.current;
    if (!tableNode) return;
    tableNode.style.setProperty(
      "--viewer-table-min-width",
      `${desktopLayout.minWidth}px`,
    );
    tableNode.style.setProperty(
      "--viewer-table-viewport-height",
      `${viewportHeightPx}px`,
    );
    const viewportNode = horizontalViewportRef.current;
    if (desktopPinnedColumn === null || !viewportNode) {
      tableNode.style.removeProperty("--viewer-pinned-scroll-left");
      return;
    }

    // The vertical scrollers are nested inside this viewport. Share its offset with
    // every pinned cell without a scroll subscription or React state per row.
    const updatePinnedOffset = () => {
      tableNode.style.setProperty(
        "--viewer-pinned-scroll-left",
        `${Math.max(0, viewportNode.scrollLeft)}px`,
      );
    };
    updatePinnedOffset();
    const resizeObserver = typeof ResizeObserver === "function"
      ? new ResizeObserver(updatePinnedOffset)
      : null;
    resizeObserver?.observe(viewportNode);
    resizeObserver?.observe(tableNode);
    window.addEventListener("resize", updatePinnedOffset);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updatePinnedOffset);
      tableNode.style.removeProperty("--viewer-pinned-scroll-left");
    };
  }, [desktopLayout.minWidth, desktopPinnedColumn, enableVirtualRows, isMobile, viewportHeightPx]);

  const virtualRowData = useMemo<ViewerVirtualRowData>(
    () => ({
      density: tableDensity,
      rows: filteredRows,
      visibleHeaders: desktopHeaders,
      pinnedColumn: desktopPinnedColumn,
      selectedRowIds,
      onToggleRowSelection,
      onInspectRow: handleInspectRow,
      gridTemplateColumns: desktopLayout.gridTemplateColumns,
    }),
    [desktopHeaders, desktopLayout.gridTemplateColumns, desktopPinnedColumn, filteredRows, handleInspectRow, onToggleRowSelection, selectedRowIds, tableDensity],
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
    <div className={isMobile ? "min-w-0" : "ops-table-shell min-w-0"}>
      <HorizontalScrollHint
        ariaLabel="Viewer data columns"
        hint="Scroll columns"
        navigationLabel="Viewer table column navigation"
        showNavigationControls
        showScrollbar
        viewportClassName="overscroll-x-contain pb-2"
        viewportRef={horizontalViewportRef}
        onScroll={handleHorizontalScroll}
      >
        {isMobile ? (
          <Suspense fallback={mobileTableFallback}>
            <ViewerMobileCardsTable
              filteredRows={filteredRows}
              onToggleRowSelection={onToggleRowSelection}
              onInspectRow={handleInspectRow}
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
                  gridTemplateColumns={desktopLayout.gridTemplateColumns}
                  density={tableDensity}
                  onToggleRowSelection={onToggleRowSelection}
                  onToggleSelectAllFiltered={onToggleSelectAllFiltered}
                  rowHeightPx={rowHeightPx}
                  selectedRowIds={selectedRowIds}
                  selectAllFiltered={selectAllFiltered}
                  virtualRowData={virtualRowData}
                  viewportHeightPx={viewportHeightPx}
                  visibleHeaders={desktopHeaders}
                  pinnedColumn={desktopPinnedColumn}
                />
              </Suspense>
            ) : (
              <Suspense fallback={desktopTableFallback}>
                <ViewerStandardTable
                  filteredRows={filteredRows}
                  density={tableDensity}
                  onInspectRow={handleInspectRow}
                  onToggleRowSelection={onToggleRowSelection}
                  onToggleSelectAllFiltered={onToggleSelectAllFiltered}
                  selectedRowIds={selectedRowIds}
                  selectAllFiltered={selectAllFiltered}
                  visibleHeaders={desktopHeaders}
                  pinnedColumn={desktopPinnedColumn}
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
      {inspectedRow ? (
        <Suspense fallback={<p role="status" className="sr-only">Membuka butiran rekod…</p>}>
          <ViewerRowDetails
            row={inspectedRow}
            headers={allHeaders ?? visibleHeaders}
            onOpenChange={handleDetailsOpenChange}
            onCloseAutoFocus={handleDetailsCloseAutoFocus}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

export const ViewerDataTable = memo(ViewerDataTableImpl);

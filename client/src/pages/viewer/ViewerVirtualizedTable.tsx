import { forwardRef, memo, type HTMLAttributes } from "react";
import { FixedSizeList } from "react-window";
import { Checkbox } from "@/components/ui/checkbox";
import type { DataRowWithId, ViewerVirtualRowData } from "@/pages/viewer/types";
import { ViewerVirtualizedRow } from "@/pages/viewer/ViewerVirtualizedRow";
import { ViewerGridShell } from "@/pages/viewer/viewer-grid-shell";
import type { TableDensity } from "@/hooks/usePersistentTableDensity";
import { getViewerColumnPresentation } from "@/pages/viewer/viewer-column-presentation";
import styles from "./ViewerDataTable.module.css";

interface ViewerVirtualizedTableProps {
  filteredRows: DataRowWithId[];
  density: TableDensity;
  gridTemplateColumns: string;
  onToggleRowSelection: (rowId: number) => void;
  onToggleSelectAllFiltered: () => void;
  rowHeightPx: number;
  selectedRowIds: Set<number>;
  selectAllFiltered: boolean;
  virtualRowData: ViewerVirtualRowData;
  viewportHeightPx: number;
  visibleHeaders: string[];
  pinnedColumn?: string | null | undefined;
}

// Preserve react-window's sizing/scrolling wrappers while exposing one body rowgroup.
const VirtualTableBody = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function VirtualTableBody(props, ref) {
    return <div {...props} ref={ref} role="rowgroup" />;
  },
);
const VirtualTableBodyContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function VirtualTableBodyContent(props, ref) {
    return <div {...props} ref={ref} role="presentation" />;
  },
);

function ViewerVirtualizedTableImpl({
  filteredRows,
  density,
  gridTemplateColumns,
  onToggleSelectAllFiltered,
  rowHeightPx,
  selectAllFiltered,
  virtualRowData,
  viewportHeightPx,
  visibleHeaders,
  pinnedColumn,
}: ViewerVirtualizedTableProps) {
  return (
    <div
      className="ops-data-table text-sm"
      role="table"
      aria-label="Imported dataset"
      aria-rowcount={filteredRows.length + 1}
      aria-colcount={visibleHeaders.length + 3}
    >
      <div className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border bg-muted" role="rowgroup">
        <ViewerGridShell
          rowIndex={1}
          gridTemplateColumns={gridTemplateColumns}
          className={`${density === "compact" ? "h-10" : "h-12"} items-center`}
        >
          <div role="columnheader" aria-colindex={1} className={density === "compact" ? "px-2" : "px-3"}>
            <Checkbox
              checked={selectAllFiltered && filteredRows.length > 0}
              onCheckedChange={onToggleSelectAllFiltered}
              aria-label="Select all filtered rows"
              data-testid="checkbox-select-all-rows"
            />
          </div>
          <div role="columnheader" aria-colindex={2} aria-label="Row number" className={`${density === "compact" ? "px-2" : "px-3"} font-medium text-muted-foreground`}>
            #
          </div>
          {visibleHeaders.map((header, index) => (
            <div
              key={header}
              role="columnheader"
              aria-colindex={index + 3}
              className={`${header === pinnedColumn ? `${styles.pinnedCell} ${styles.pinnedHeader}` : ""} truncate whitespace-nowrap px-3 font-medium text-muted-foreground`}
              title={header}
              aria-label={header}
              data-align={getViewerColumnPresentation(header, density).align}
              data-viewer-column={header}
              data-viewer-pinned={header === pinnedColumn ? "true" : undefined}
            >
              <span className={styles.gridCellText}>{header}</span>
            </div>
          ))}
          <div role="columnheader" aria-colindex={visibleHeaders.length + 3} className="px-2"><span className="sr-only">Record details</span></div>
        </ViewerGridShell>
      </div>
      <FixedSizeList
        height={viewportHeightPx}
        itemCount={filteredRows.length}
        itemData={virtualRowData}
        itemSize={rowHeightPx}
        width="100%"
        overscanCount={10}
        outerElementType={VirtualTableBody}
        innerElementType={VirtualTableBodyContent}
      >
        {ViewerVirtualizedRow}
      </FixedSizeList>
    </div>
  );
}

export const ViewerVirtualizedTable = memo(ViewerVirtualizedTableImpl);

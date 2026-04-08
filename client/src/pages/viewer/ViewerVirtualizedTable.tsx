import type { MutableRefObject } from "react";
import { FixedSizeList } from "react-window";
import { Checkbox } from "@/components/ui/checkbox";
import type { DataRowWithId, ViewerVirtualRowData } from "@/pages/viewer/types";
import { ViewerVirtualizedRow } from "@/pages/viewer/ViewerVirtualizedRow";
import { ViewerGridShell } from "@/pages/viewer/viewer-grid-shell";
import styles from "./ViewerDataTable.module.css";

interface ViewerVirtualizedTableProps {
  filteredRows: DataRowWithId[];
  gridTemplateColumns: string;
  onToggleRowSelection: (rowId: number) => void;
  onToggleSelectAllFiltered: () => void;
  rowHeightPx: number;
  selectedRowIds: Set<number>;
  selectAllFiltered: boolean;
  virtualRowData: ViewerVirtualRowData;
  viewportHeightPx: number;
  virtualTableWidthRef: MutableRefObject<HTMLDivElement | null>;
  visibleHeaders: string[];
}

export function ViewerVirtualizedTable({
  filteredRows,
  gridTemplateColumns,
  onToggleSelectAllFiltered,
  rowHeightPx,
  selectAllFiltered,
  virtualRowData,
  viewportHeightPx,
  virtualTableWidthRef,
  visibleHeaders,
}: ViewerVirtualizedTableProps) {
  return (
    <div ref={virtualTableWidthRef} className={styles.virtualTableWidth}>
      <div className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border bg-muted">
        <ViewerGridShell gridTemplateColumns={gridTemplateColumns} className="h-12 items-center">
          <div className="px-3">
            <Checkbox
              checked={selectAllFiltered && filteredRows.length > 0}
              onCheckedChange={onToggleSelectAllFiltered}
              data-testid="checkbox-select-all-rows"
            />
          </div>
          <div className="px-3 font-medium text-muted-foreground">#</div>
          {visibleHeaders.map((header) => (
            <div key={header} className="truncate whitespace-nowrap px-3 font-medium text-muted-foreground">
              {header}
            </div>
          ))}
        </ViewerGridShell>
      </div>
      <FixedSizeList
        height={viewportHeightPx}
        itemCount={filteredRows.length}
        itemData={virtualRowData}
        itemSize={rowHeightPx}
        width="100%"
        overscanCount={10}
      >
        {ViewerVirtualizedRow}
      </FixedSizeList>
    </div>
  );
}

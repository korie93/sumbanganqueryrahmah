import { memo } from "react";
import { FixedSizeList } from "react-window";
import { Checkbox } from "@/components/ui/checkbox";
import type { DataRowWithId, ViewerVirtualRowData } from "@/pages/viewer/types";
import { ViewerVirtualizedRow } from "@/pages/viewer/ViewerVirtualizedRow";
import { ViewerGridShell } from "@/pages/viewer/viewer-grid-shell";
import type { TableDensity } from "@/hooks/usePersistentTableDensity";

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
}

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
}: ViewerVirtualizedTableProps) {
  return (
    <div>
      <div className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border bg-muted">
        <ViewerGridShell
          gridTemplateColumns={gridTemplateColumns}
          className={`${density === "compact" ? "h-10" : "h-12"} items-center`}
        >
          <div className={density === "compact" ? "px-2" : "px-3"}>
            <Checkbox
              checked={selectAllFiltered && filteredRows.length > 0}
              onCheckedChange={onToggleSelectAllFiltered}
              aria-label="Select all filtered rows"
              data-testid="checkbox-select-all-rows"
            />
          </div>
          <div className={`${density === "compact" ? "px-2" : "px-3"} font-medium text-muted-foreground`}>
            #
          </div>
          {visibleHeaders.map((header) => (
            <div
              key={header}
              className="truncate whitespace-nowrap px-3 font-medium text-muted-foreground"
              title={header}
              aria-label={header}
            >
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

export const ViewerVirtualizedTable = memo(ViewerVirtualizedTableImpl);

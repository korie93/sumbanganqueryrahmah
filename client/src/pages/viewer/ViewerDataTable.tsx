import { useLayoutEffect, useMemo, useRef } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import type { DataRowWithId, ViewerVirtualRowData } from "@/pages/viewer/types";
import {
  ViewerDataTableFeedback,
  ViewerMobileCardsTable,
  ViewerStandardTable,
  ViewerVirtualizedTable,
} from "@/pages/viewer/ViewerDataTableSections";
import styles from "./ViewerDataTable.module.css";

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

  return (
    <div className="ops-table-shell overflow-x-auto">
      {isMobile ? (
        <ViewerMobileCardsTable
          filteredRows={filteredRows}
          onToggleRowSelection={onToggleRowSelection}
          onToggleSelectAllFiltered={onToggleSelectAllFiltered}
          selectedRowIds={selectedRowIds}
          selectAllFiltered={selectAllFiltered}
          visibleHeaders={visibleHeaders}
        />
      ) : enableVirtualRows ? (
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
      ) : (
        <ViewerStandardTable
          filteredRows={filteredRows}
          onToggleRowSelection={onToggleRowSelection}
          onToggleSelectAllFiltered={onToggleSelectAllFiltered}
          selectedRowIds={selectedRowIds}
          selectAllFiltered={selectAllFiltered}
          visibleHeaders={visibleHeaders}
        />
      )}

      <ViewerDataTableFeedback
        debouncedSearch={debouncedSearch}
        filteredRowsCount={filteredRows.length}
        minSearchLength={minSearchLength}
      />
    </div>
  );
}

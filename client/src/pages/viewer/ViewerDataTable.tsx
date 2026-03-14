import { useCallback, useMemo } from "react";
import { FixedSizeList, type ListChildComponentProps } from "react-window";
import { Checkbox } from "@/components/ui/checkbox";
import type { DataRowWithId, ViewerVirtualRowData } from "@/pages/viewer/types";

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

  const renderVirtualRow = useCallback(
    ({ index, style, data }: ListChildComponentProps<ViewerVirtualRowData>) => {
      const row = data.rows[index];
      const selected = data.selectedRowIds.has(row.__rowId);

      return (
        <div style={style}>
          <div
            className={`grid h-[48px] items-center border-t border-border px-0 hover:bg-muted/50 ${selected ? "bg-primary/10" : ""}`}
            style={{ gridTemplateColumns: data.gridTemplateColumns }}
          >
            <div className="px-3">
              <Checkbox checked={selected} onCheckedChange={() => data.onToggleRowSelection(row.__rowId)} />
            </div>
            <div className="px-3 text-muted-foreground">{row.__rowId + 1}</div>
            {data.visibleHeaders.map((header) => (
              <div
                key={`${row.__rowId}-${header}`}
                className="truncate whitespace-nowrap px-3 text-foreground"
                title={String(row[header] ?? "-")}
              >
                {String(row[header] ?? "-")}
              </div>
            ))}
          </div>
        </div>
      );
    },
    [],
  );

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      {enableVirtualRows ? (
        <div style={{ minWidth: `${virtualTableMinWidth}px` }}>
          <div className="sticky top-0 z-10 border-b border-border bg-muted">
            <div className="grid h-12 items-center" style={{ gridTemplateColumns }}>
              <div className="px-3">
                <Checkbox
                  checked={selectAllFiltered && filteredRows.length > 0}
                  onCheckedChange={onToggleSelectAllFiltered}
                  data-testid="checkbox-select-all-rows"
                />
              </div>
              <div className="px-3 font-medium text-muted-foreground">#</div>
              {visibleHeaders.map((header, index) => (
                <div key={index} className="truncate whitespace-nowrap px-3 font-medium text-muted-foreground">
                  {header}
                </div>
              ))}
            </div>
          </div>
          <FixedSizeList
            height={viewportHeightPx}
            itemCount={filteredRows.length}
            itemData={virtualRowData}
            itemSize={rowHeightPx}
            width="100%"
            overscanCount={10}
          >
            {renderVirtualRow}
          </FixedSizeList>
        </div>
      ) : (
        <div className="max-h-[560px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted">
              <tr>
                <th className="w-10 p-3 text-left font-medium text-muted-foreground">
                  <Checkbox
                    checked={selectAllFiltered && filteredRows.length > 0}
                    onCheckedChange={onToggleSelectAllFiltered}
                    data-testid="checkbox-select-all-rows"
                  />
                </th>
                <th className="w-12 p-3 text-left font-medium text-muted-foreground">#</th>
                {visibleHeaders.map((header, index) => (
                  <th key={index} className="whitespace-nowrap p-3 text-left font-medium text-muted-foreground">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr
                  key={row.__rowId}
                  className={`h-[48px] border-t border-border hover:bg-muted/50 ${selectedRowIds.has(row.__rowId) ? "bg-primary/10" : ""}`}
                >
                  <td className="p-3">
                    <Checkbox
                      checked={selectedRowIds.has(row.__rowId)}
                      onCheckedChange={() => onToggleRowSelection(row.__rowId)}
                    />
                  </td>
                  <td className="p-3 text-muted-foreground">{row.__rowId + 1}</td>
                  {visibleHeaders.map((header) => (
                    <td
                      key={header}
                      className="max-w-[300px] truncate whitespace-nowrap p-3 text-foreground"
                      title={String(row[header] ?? "-")}
                    >
                      {String(row[header] ?? "-")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {debouncedSearch && debouncedSearch.length < minSearchLength ? (
        <div className="p-6 text-center text-muted-foreground">
          Type at least {minSearchLength} characters to search
        </div>
      ) : null}

      {debouncedSearch && debouncedSearch.length >= minSearchLength && filteredRows.length === 0 ? (
        <div className="p-6 text-center text-muted-foreground">No results found</div>
      ) : null}
    </div>
  );
}

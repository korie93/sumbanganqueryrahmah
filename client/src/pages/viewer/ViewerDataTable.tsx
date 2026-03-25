import { memo, useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { FixedSizeList, type ListChildComponentProps } from "react-window";
import { Checkbox } from "@/components/ui/checkbox";
import type { DataRowWithId, ViewerVirtualRowData } from "@/pages/viewer/types";
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

type PositionedRowShellProps = {
  positionStyle: React.CSSProperties;
  children: React.ReactNode;
};

const PositionedRowShell = memo(function PositionedRowShell({
  positionStyle,
  children,
}: PositionedRowShellProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const node = shellRef.current;
    if (!node) return;
    Object.assign(node.style, positionStyle);
  }, [positionStyle]);

  return <div ref={shellRef}>{children}</div>;
});

type ViewerGridShellProps = {
  gridTemplateColumns: string;
  className: string;
  children: React.ReactNode;
};

const ViewerGridShell = memo(function ViewerGridShell({
  gridTemplateColumns,
  className,
  children,
}: ViewerGridShellProps) {
  const gridRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    gridRef.current?.style.setProperty("--viewer-grid-template-columns", gridTemplateColumns);
  }, [gridTemplateColumns]);

  return (
    <div ref={gridRef} className={`${styles.viewerGrid} ${className}`}>
      {children}
    </div>
  );
});

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

  const renderVirtualRow = useCallback(
    ({ index, style, data }: ListChildComponentProps<ViewerVirtualRowData>) => {
      const row = data.rows[index];
      const selected = data.selectedRowIds.has(row.__rowId);

      return (
        <PositionedRowShell positionStyle={style}>
          <ViewerGridShell
            gridTemplateColumns={data.gridTemplateColumns}
            className={`h-[48px] items-center border-t border-border px-0 hover:bg-muted/50 ${selected ? "bg-primary/10" : ""}`}
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
          </ViewerGridShell>
        </PositionedRowShell>
      );
    },
    [],
  );

  return (
    <div className="ops-table-shell overflow-x-auto">
      {enableVirtualRows ? (
        <div ref={virtualTableWidthRef} className={styles.virtualTableWidth}>
          <div className="sticky top-0 z-10 border-b border-border bg-muted">
            <ViewerGridShell gridTemplateColumns={gridTemplateColumns} className="h-12 items-center">
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
            {renderVirtualRow}
          </FixedSizeList>
        </div>
      ) : (
        <div className="max-h-[560px] overflow-y-auto">
          <table className="ops-data-table w-full text-sm">
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

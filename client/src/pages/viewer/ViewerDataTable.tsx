import { memo, useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { FixedSizeList, type ListChildComponentProps } from "react-window";
import { useIsMobile } from "@/hooks/use-mobile";
import { Checkbox } from "@/components/ui/checkbox";
import type { DataRowWithId, ViewerVirtualRowData } from "@/pages/viewer/types";
import { applyViewerVirtualRowStyle } from "@/pages/viewer/viewer-virtual-row-style";
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
    applyViewerVirtualRowStyle(node.style, positionStyle);
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
      {isMobile ? (
        <div className="space-y-3">
          {filteredRows.length > 0 ? (
            <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background/80 px-3 py-2.5 text-sm text-muted-foreground">
              <span>{filteredRows.length} row{filteredRows.length === 1 ? "" : "s"} on this page</span>
              <label className="flex items-center gap-2 text-foreground">
                <Checkbox
                  checked={selectAllFiltered && filteredRows.length > 0}
                  onCheckedChange={onToggleSelectAllFiltered}
                  data-testid="checkbox-select-all-rows"
                />
                <span className="text-sm font-medium">Select all</span>
              </label>
            </div>
          ) : null}

          {filteredRows.map((row) => {
            const previewHeaders = visibleHeaders.slice(0, 4);
            const overflowHeaders = visibleHeaders.slice(4);
            const selected = selectedRowIds.has(row.__rowId);

            return (
              <article
                key={row.__rowId}
                className={`rounded-2xl border border-border/60 bg-background/80 p-3 shadow-sm ${selected ? "border-primary/40 bg-primary/5" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Row {row.__rowId + 1}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {visibleHeaders.length > 0
                        ? `${Math.min(visibleHeaders.length, 4)} field${visibleHeaders.length === 1 ? "" : "s"} shown`
                        : "No visible columns selected"}
                    </p>
                  </div>
                  <Checkbox
                    checked={selected}
                    onCheckedChange={() => onToggleRowSelection(row.__rowId)}
                    aria-label={`Select row ${row.__rowId + 1}`}
                  />
                </div>

                {previewHeaders.length > 0 ? (
                  <dl className="mt-3 space-y-2">
                    {previewHeaders.map((header) => (
                      <div key={`${row.__rowId}-${header}`} className="rounded-xl border border-border/50 bg-muted/30 px-3 py-2">
                        <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                          {header}
                        </dt>
                        <dd className="mt-1 break-words text-sm text-foreground">
                          {String(row[header] ?? "-")}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}

                {overflowHeaders.length > 0 ? (
                  <details className="mt-3 rounded-xl border border-border/50 bg-background/70">
                    <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-primary">
                      Show {overflowHeaders.length} more field{overflowHeaders.length === 1 ? "" : "s"}
                    </summary>
                    <dl className="space-y-2 border-t border-border/50 px-3 py-3">
                      {overflowHeaders.map((header) => (
                        <div key={`${row.__rowId}-${header}-extra`} className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2">
                          <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                            {header}
                          </dt>
                          <dd className="mt-1 break-words text-sm text-foreground">
                            {String(row[header] ?? "-")}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : enableVirtualRows ? (
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

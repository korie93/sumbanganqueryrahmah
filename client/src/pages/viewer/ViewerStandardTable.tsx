import { memo, useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  buildViewerRowAriaLabel,
  formatViewerCellValue,
} from "@/pages/viewer/viewer-row-aria";
import type { DataRowWithId } from "@/pages/viewer/types";
import type { TableDensity } from "@/hooks/usePersistentTableDensity";
import { getViewerColumnPresentation, getViewerTableLayout } from "@/pages/viewer/viewer-column-presentation";
import { ViewerRowDetailsButton } from "@/pages/viewer/ViewerRowDetailsButton";

interface ViewerStandardTableProps {
  filteredRows: DataRowWithId[];
  density: TableDensity;
  onToggleRowSelection: (rowId: number) => void;
  onInspectRow?: ((row: DataRowWithId) => void) | undefined;
  onToggleSelectAllFiltered: () => void;
  selectedRowIds: Set<number>;
  selectAllFiltered: boolean;
  visibleHeaders: string[];
}

interface ViewerStandardTableRowProps {
  row: DataRowWithId;
  density: TableDensity;
  selected: boolean;
  visibleHeaders: string[];
  onToggleRowSelection: (rowId: number) => void;
  onInspectRow?: ((row: DataRowWithId) => void) | undefined;
}

function ViewerTableColumn({ width }: { width: number }) {
  const columnRef = useRef<HTMLTableColElement>(null);
  useLayoutEffect(() => {
    columnRef.current?.style.setProperty("width", `${width}px`);
  }, [width]);
  return <col ref={columnRef} />;
}

const ViewerStandardTableRow = memo(function ViewerStandardTableRow({
  row,
  density,
  selected,
  visibleHeaders,
  onToggleRowSelection,
  onInspectRow,
}: ViewerStandardTableRowProps) {
  const rowAriaLabel = useMemo(
    () => buildViewerRowAriaLabel({ row, visibleHeaders }),
    [row, visibleHeaders],
  );
  const handleToggleRow = useCallback(() => {
    onToggleRowSelection(row.__rowId);
  }, [onToggleRowSelection, row.__rowId]);

  return (
    <tr
      aria-label={rowAriaLabel}
      className={`${density === "compact" ? "h-10" : "h-12"} border-t border-border hover:bg-muted/50 ${
        selected ? "bg-primary/10" : ""
      }`}
      data-density={density}
    >
      <td className={density === "compact" ? "p-2" : "p-3"}>
        <Checkbox
          checked={selected}
          onCheckedChange={handleToggleRow}
          aria-label={`Select row ${row.__rowId + 1}`}
        />
      </td>
      <td className={`${density === "compact" ? "p-2" : "p-3"} text-muted-foreground`}>
        {row.__rowId + 1}
      </td>
      {visibleHeaders.map((header) => {
        const cellText = formatViewerCellValue(row[header]);
        const presentation = getViewerColumnPresentation(header, density);

        return (
          <td
            key={header}
            className={`truncate whitespace-nowrap text-foreground ${presentation.align === "right" ? "text-right tabular-nums" : "text-left"} ${
              density === "compact" ? "p-2" : "p-3"
            }`}
            title={cellText}
            data-column-kind={presentation.kind}
          >
            {cellText}
          </td>
        );
      })}
      <td className="px-2 text-center">
        <ViewerRowDetailsButton row={row} onInspectRow={onInspectRow} />
      </td>
    </tr>
  );
});

function ViewerStandardTableImpl({
  filteredRows,
  density,
  onToggleRowSelection,
  onInspectRow,
  onToggleSelectAllFiltered,
  selectedRowIds,
  selectAllFiltered,
  visibleHeaders,
}: ViewerStandardTableProps) {
  const layout = useMemo(() => getViewerTableLayout(visibleHeaders, density), [density, visibleHeaders]);

  return (
    <div className="max-h-[var(--viewer-table-viewport-height,560px)] overflow-y-auto overscroll-y-contain">
      <table className="ops-data-table w-full table-fixed text-sm">
        <caption className="sr-only">Imported dataset. Use the details button to read every loaded field in a row.</caption>
        <colgroup>
          <ViewerTableColumn width={44} />
          <ViewerTableColumn width={56} />
          {visibleHeaders.map((header, index) => <ViewerTableColumn key={header} width={layout.columns[index].minWidth} />)}
          <ViewerTableColumn width={48} />
        </colgroup>
        <thead className="sticky top-0 z-[var(--z-sticky-header)] bg-muted">
          <tr>
            <th
              scope="col"
              className={`text-left font-medium text-muted-foreground ${
                density === "compact" ? "p-2" : "p-3"
              }`}
            >
              <Checkbox
                checked={selectAllFiltered && filteredRows.length > 0}
                onCheckedChange={onToggleSelectAllFiltered}
                aria-label="Select all filtered rows"
                data-testid="checkbox-select-all-rows"
              />
            </th>
            <th
              scope="col"
              className={`text-left font-medium text-muted-foreground ${
                density === "compact" ? "p-2" : "p-3"
              }`}
            >
              #
            </th>
            {visibleHeaders.map((header) => (
              <th
                key={header}
                scope="col"
                className={`truncate whitespace-nowrap font-medium text-muted-foreground ${getViewerColumnPresentation(header, density).align === "right" ? "text-right tabular-nums" : "text-left"} ${
                  density === "compact" ? "p-2" : "p-3"
                }`}
                title={header}
              >
                {header}
              </th>
            ))}
            <th scope="col" className="px-2"><span className="sr-only">Record details</span></th>
          </tr>
        </thead>
        <tbody>
          {filteredRows.map((row) => (
            <ViewerStandardTableRow
              key={row.__rowId}
              row={row}
              density={density}
              selected={selectedRowIds.has(row.__rowId)}
              visibleHeaders={visibleHeaders}
              onToggleRowSelection={onToggleRowSelection}
              onInspectRow={onInspectRow}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const ViewerStandardTable = memo(ViewerStandardTableImpl);

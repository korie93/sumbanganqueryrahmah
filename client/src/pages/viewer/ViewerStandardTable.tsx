import { memo, useCallback, useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  buildViewerRowAriaLabel,
  formatViewerCellValue,
} from "@/pages/viewer/viewer-row-aria";
import type { DataRowWithId } from "@/pages/viewer/types";

interface ViewerStandardTableProps {
  filteredRows: DataRowWithId[];
  onToggleRowSelection: (rowId: number) => void;
  onToggleSelectAllFiltered: () => void;
  selectedRowIds: Set<number>;
  selectAllFiltered: boolean;
  visibleHeaders: string[];
}

interface ViewerStandardTableRowProps {
  row: DataRowWithId;
  selected: boolean;
  visibleHeaders: string[];
  onToggleRowSelection: (rowId: number) => void;
}

const ViewerStandardTableRow = memo(function ViewerStandardTableRow({
  row,
  selected,
  visibleHeaders,
  onToggleRowSelection,
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
      className={`h-[48px] border-t border-border hover:bg-muted/50 ${selected ? "bg-primary/10" : ""}`}
    >
      <td className="p-3">
        <Checkbox
          checked={selected}
          onCheckedChange={handleToggleRow}
          aria-label={`Select row ${row.__rowId + 1}`}
        />
      </td>
      <td className="p-3 text-muted-foreground">{row.__rowId + 1}</td>
      {visibleHeaders.map((header) => {
        const cellText = formatViewerCellValue(row[header]);

        return (
          <td
            key={header}
            className="max-w-[300px] truncate whitespace-nowrap p-3 text-foreground"
            title={cellText}
          >
            {cellText}
          </td>
        );
      })}
    </tr>
  );
});

function ViewerStandardTableImpl({
  filteredRows,
  onToggleRowSelection,
  onToggleSelectAllFiltered,
  selectedRowIds,
  selectAllFiltered,
  visibleHeaders,
}: ViewerStandardTableProps) {
  return (
    <div className="max-h-[560px] overflow-y-auto">
      <table className="ops-data-table w-full table-fixed text-sm">
        <thead className="sticky top-0 z-[var(--z-sticky-header)] bg-muted">
          <tr>
            <th scope="col" className="w-10 p-3 text-left font-medium text-muted-foreground">
              <Checkbox
                checked={selectAllFiltered && filteredRows.length > 0}
                onCheckedChange={onToggleSelectAllFiltered}
                aria-label="Select all filtered rows"
                data-testid="checkbox-select-all-rows"
              />
            </th>
            <th scope="col" className="w-12 p-3 text-left font-medium text-muted-foreground">#</th>
            {visibleHeaders.map((header) => (
              <th
                key={header}
                scope="col"
                className="truncate whitespace-nowrap p-3 text-left font-medium text-muted-foreground"
                title={header}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filteredRows.map((row) => (
            <ViewerStandardTableRow
              key={row.__rowId}
              row={row}
              selected={selectedRowIds.has(row.__rowId)}
              visibleHeaders={visibleHeaders}
              onToggleRowSelection={onToggleRowSelection}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const ViewerStandardTable = memo(ViewerStandardTableImpl);

import { Checkbox } from "@/components/ui/checkbox";
import type { DataRowWithId } from "@/pages/viewer/types";

interface ViewerStandardTableProps {
  filteredRows: DataRowWithId[];
  onToggleRowSelection: (rowId: number) => void;
  onToggleSelectAllFiltered: () => void;
  selectedRowIds: Set<number>;
  selectAllFiltered: boolean;
  visibleHeaders: string[];
}

export function ViewerStandardTable({
  filteredRows,
  onToggleRowSelection,
  onToggleSelectAllFiltered,
  selectedRowIds,
  selectAllFiltered,
  visibleHeaders,
}: ViewerStandardTableProps) {
  return (
    <div className="max-h-[560px] overflow-y-auto">
      <table className="ops-data-table w-full text-sm">
        <thead className="sticky top-0 z-[var(--z-sticky-header)] bg-muted">
          <tr>
            <th className="w-10 p-3 text-left font-medium text-muted-foreground">
              <Checkbox
                checked={selectAllFiltered && filteredRows.length > 0}
                onCheckedChange={onToggleSelectAllFiltered}
                data-testid="checkbox-select-all-rows"
              />
            </th>
            <th className="w-12 p-3 text-left font-medium text-muted-foreground">#</th>
            {visibleHeaders.map((header) => (
              <th key={header} className="whitespace-nowrap p-3 text-left font-medium text-muted-foreground">
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
  );
}

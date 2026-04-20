import { Checkbox } from "@/components/ui/checkbox";
import { ViewerMobileCard } from "@/pages/viewer/ViewerMobileCard";
import type { DataRowWithId } from "@/pages/viewer/types";

interface ViewerMobileCardsTableProps {
  filteredRows: DataRowWithId[];
  onToggleRowSelection: (rowId: number) => void;
  onToggleSelectAllFiltered: () => void;
  selectedRowIds: Set<number>;
  selectAllFiltered: boolean;
  visibleHeaders: string[];
}

export function ViewerMobileCardsTable({
  filteredRows,
  onToggleRowSelection,
  onToggleSelectAllFiltered,
  selectedRowIds,
  selectAllFiltered,
  visibleHeaders,
}: ViewerMobileCardsTableProps) {
  return (
    <div className="space-y-3">
      {filteredRows.length > 0 ? (
        <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background/80 px-3 py-2.5 text-sm text-muted-foreground">
          <span>
            {filteredRows.length} row{filteredRows.length === 1 ? "" : "s"} on this page
          </span>
          <div className="flex items-center gap-2 text-foreground">
            <Checkbox
              checked={selectAllFiltered && filteredRows.length > 0}
              onCheckedChange={onToggleSelectAllFiltered}
              aria-label="Select all rows on this page"
              data-testid="checkbox-select-all-rows"
            />
            <span className="text-sm font-medium">Select all</span>
          </div>
        </div>
      ) : null}

      {filteredRows.map((row) => (
        <ViewerMobileCard
          key={row.__rowId}
          row={row}
          selected={selectedRowIds.has(row.__rowId)}
          visibleHeaders={visibleHeaders}
          onToggleRowSelection={onToggleRowSelection}
        />
      ))}
    </div>
  );
}

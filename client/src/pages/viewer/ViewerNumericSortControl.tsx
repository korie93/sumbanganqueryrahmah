import { memo, useCallback } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ImportDataNumericSort } from "@shared/common/import-data-sort";

type ViewerNumericSortControlProps = {
  headers: string[];
  numericSort?: ImportDataNumericSort | null | undefined;
  onNumericSortChange?: ((sort: ImportDataNumericSort | null) => void) | undefined;
};

const DEFAULT_ORDER = "default";

function ViewerNumericSortControlImpl({
  headers,
  numericSort,
  onNumericSortChange,
}: ViewerNumericSortControlProps) {
  const columnIndex = numericSort ? headers.indexOf(numericSort.column) : -1;
  const handleColumnChange = useCallback((value: string) => {
    if (value === DEFAULT_ORDER) {
      onNumericSortChange?.(null);
      return;
    }
    const match = /^column:(0|[1-9][0-9]*)$/.exec(value);
    const column = match ? headers[Number(match[1])] : undefined;
    if (column !== undefined) onNumericSortChange?.({ column, direction: numericSort?.direction ?? "asc" });
  }, [headers, numericSort?.direction, onNumericSortChange]);
  const handleDirectionChange = useCallback((value: string) => {
    if (numericSort && (value === "asc" || value === "desc")) {
      onNumericSortChange?.({ ...numericSort, direction: value });
    }
  }, [numericSort, onNumericSortChange]);

  return (
    <fieldset className="mb-4 min-w-0 rounded-lg border border-border/60 bg-muted/20 p-3">
      <legend className="px-1 text-sm font-medium text-foreground">Number order</legend>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <label htmlFor="viewer-number-order-column" className="text-xs text-muted-foreground">Column</label>
          <Select value={columnIndex >= 0 ? `column:${columnIndex}` : DEFAULT_ORDER} onValueChange={handleColumnChange}>
            <SelectTrigger id="viewer-number-order-column" aria-label="Number order column" aria-describedby="viewer-number-order-help" className="w-full min-w-0" data-testid="select-viewer-number-order-column">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DEFAULT_ORDER}>Default order</SelectItem>
              {headers.map((header, index) => <SelectItem key={header} value={`column:${index}`}>{header}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0 space-y-1.5">
          <label htmlFor="viewer-number-order-direction" className="text-xs text-muted-foreground">Order</label>
          <Select value={numericSort?.direction ?? "asc"} onValueChange={handleDirectionChange} disabled={columnIndex < 0}>
            <SelectTrigger id="viewer-number-order-direction" aria-label="Number order direction" aria-describedby="viewer-number-order-help" className="w-full min-w-0" data-testid="select-viewer-number-order-direction">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="asc">Smallest first</SelectItem>
              <SelectItem value="desc">Largest first</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <p id="viewer-number-order-help" className="mt-2 text-xs text-muted-foreground">Across all matching rows. Empty or nonnumeric values appear last.</p>
    </fieldset>
  );
}

export const ViewerNumericSortControl = memo(ViewerNumericSortControlImpl);

import { memo, useCallback, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ViewerDataFieldCard } from "@/pages/viewer/ViewerDataFieldCard";
import { buildViewerRowAriaLabel } from "@/pages/viewer/viewer-row-aria";
import type { DataRowWithId } from "@/pages/viewer/types";
import {
  buildViewerOverflowFieldsLabel,
  buildViewerVisibleFieldsSummary,
} from "@/pages/viewer/viewer-table-utils";

interface ViewerMobileCardProps {
  row: DataRowWithId;
  selected: boolean;
  visibleHeaders: string[];
  onToggleRowSelection: (rowId: number) => void;
}

function ViewerMobileCardImpl({
  row,
  selected,
  visibleHeaders,
  onToggleRowSelection,
}: ViewerMobileCardProps) {
  const previewHeaders = useMemo(() => visibleHeaders.slice(0, 4), [visibleHeaders]);
  const overflowHeaders = useMemo(() => visibleHeaders.slice(4), [visibleHeaders]);
  const rowAriaLabel = useMemo(
    () => buildViewerRowAriaLabel({ row, visibleHeaders }),
    [row, visibleHeaders],
  );
  const visibleFieldsSummary = useMemo(
    () => buildViewerVisibleFieldsSummary(visibleHeaders.length),
    [visibleHeaders.length],
  );
  const overflowFieldsLabel = useMemo(
    () => buildViewerOverflowFieldsLabel(overflowHeaders.length),
    [overflowHeaders.length],
  );
  const handleToggleRow = useCallback(() => {
    onToggleRowSelection(row.__rowId);
  }, [onToggleRowSelection, row.__rowId]);

  return (
    <article
      aria-label={rowAriaLabel}
      className={`rounded-xl border p-3 ${selected ? "border-primary bg-primary/5" : "border-border bg-card"}`}
      role="group"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-foreground">
            Row {row.__rowId + 1}
          </p>
          <p className="text-xs text-muted-foreground">
            {visibleFieldsSummary}
          </p>
        </div>
        <label className="flex min-h-11 min-w-11 cursor-pointer items-center justify-end">
          <Checkbox
            checked={selected}
            onCheckedChange={handleToggleRow}
            aria-label={`Select row ${row.__rowId + 1}`}
          />
        </label>
      </div>

      {previewHeaders.length > 0 ? (
        <dl className="mt-2 divide-y divide-border">
          {previewHeaders.map((header) => (
            <ViewerDataFieldCard
              key={`${row.__rowId}-${header}`}
              header={header}
              value={row[header]}
            />
          ))}
        </dl>
      ) : null}

      {overflowHeaders.length > 0 ? (
        <details className="group mt-2 border-t border-border">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg py-2 text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {overflowFieldsLabel}
            <ChevronDown className="h-4 w-4 shrink-0 group-open:rotate-180" aria-hidden="true" />
          </summary>
          <dl className="divide-y divide-border border-t border-border">
            {overflowHeaders.map((header) => (
              <ViewerDataFieldCard
                key={`${row.__rowId}-${header}-extra`}
                header={header}
                value={row[header]}
                compact
              />
            ))}
          </dl>
        </details>
      ) : null}
    </article>
  );
}

export const ViewerMobileCard = memo(ViewerMobileCardImpl);

import { memo, useCallback, useMemo } from "react";
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
      className={`rounded-2xl border border-border/60 bg-background/80 p-3 shadow-sm ${selected ? "border-primary/40 bg-primary/5" : ""}`}
      role="group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-2xs font-semibold uppercase tracking-label-md text-muted-foreground">
            Row {row.__rowId + 1}
          </p>
          <p className="text-sm text-muted-foreground">
            {visibleFieldsSummary}
          </p>
        </div>
        <Checkbox
          checked={selected}
          onCheckedChange={handleToggleRow}
          aria-label={`Select row ${row.__rowId + 1}`}
        />
      </div>

      {previewHeaders.length > 0 ? (
        <dl className="mt-3 space-y-2">
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
        <details className="mt-3 rounded-xl border border-border/50 bg-background/70">
          <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-primary">
            {overflowFieldsLabel}
          </summary>
          <dl className="space-y-2 border-t border-border/50 px-3 py-3">
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

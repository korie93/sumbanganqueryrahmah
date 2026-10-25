import { memo, useCallback, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ViewerDataFieldCard } from "@/pages/viewer/ViewerDataFieldCard";
import { buildViewerRowAriaLabel } from "@/pages/viewer/viewer-row-aria";
import type { DataRowWithId } from "@/pages/viewer/types";
import { getViewerMobileCardPresentation } from "@/pages/viewer/viewer-column-presentation";
import { ViewerRowDetailsButton } from "@/pages/viewer/ViewerRowDetailsButton";
import {
  buildViewerOverflowFieldsLabel,
  buildViewerVisibleFieldsSummary,
} from "@/pages/viewer/viewer-table-utils";

interface ViewerMobileCardProps {
  row: DataRowWithId;
  selected: boolean;
  visibleHeaders: string[];
  onToggleRowSelection: (rowId: number) => void;
  onInspectRow?: ((row: DataRowWithId) => void) | undefined;
}

function ViewerMobileOverflowFields({ row, headers }: { row: DataRowWithId; headers: string[] }) {
  const [expanded, setExpanded] = useState(false);
  // Let native details own pointer/keyboard toggling. Read its actual state:
  // rapid native toggle events may be coalesced into a single notification.
  return (
    <details className="group mt-1 border-t border-border"
      onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg py-2 text-sm font-medium text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
        {buildViewerOverflowFieldsLabel(headers.length)}
        <ChevronDown className="h-4 w-4 shrink-0 group-open:rotate-180" aria-hidden="true" />
      </summary>
      {expanded ? (
        <dl className="divide-y divide-border border-t border-border">
          {headers.map((header) => (
            <ViewerDataFieldCard
              key={`${row.__rowId}-${header}-extra`}
              header={header}
              value={row[header]}
              compact
            />
          ))}
        </dl>
      ) : null}
    </details>
  );
}

function ViewerMobileCardImpl({
  row,
  selected,
  visibleHeaders,
  onToggleRowSelection,
  onInspectRow,
}: ViewerMobileCardProps) {
  const { identityHeader, identity: rowIdentity, previewHeaders, overflowHeaders, shownFieldsCount } = useMemo(
    () => getViewerMobileCardPresentation(row, visibleHeaders),
    [row, visibleHeaders],
  );
  const rowAriaLabel = useMemo(
    () => buildViewerRowAriaLabel({ row, visibleHeaders, shownFieldsCount }),
    [row, shownFieldsCount, visibleHeaders],
  );
  const visibleFieldsSummary = useMemo(
    () => buildViewerVisibleFieldsSummary(visibleHeaders.length, shownFieldsCount),
    [shownFieldsCount, visibleHeaders.length],
  );
  const handleToggleRow = useCallback(() => {
    onToggleRowSelection(row.__rowId);
  }, [onToggleRowSelection, row.__rowId]);

  return (
    <article
      aria-label={rowAriaLabel}
      className={`viewer-mobile-card rounded-xl border p-3 ${selected ? "border-primary bg-primary/5" : "border-border bg-card"}`}
      role="group"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="break-words text-sm font-semibold leading-5 text-foreground [overflow-wrap:anywhere]">
            {identityHeader !== undefined ? <span className="sr-only">{identityHeader}: </span> : null}
            {rowIdentity}
          </p>
          <p className="text-xs text-muted-foreground">
            {identityHeader !== undefined ? `Row ${row.__rowId + 1} · ` : ""}{visibleFieldsSummary}
          </p>
        </div>
        <div className="viewer-mobile-card-actions flex shrink-0 items-center gap-1">
          <label className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
            <Checkbox
              checked={selected}
              onCheckedChange={handleToggleRow}
              aria-label={`Select row ${row.__rowId + 1}`}
            />
          </label>
          <ViewerRowDetailsButton row={row} onInspectRow={onInspectRow} />
        </div>
      </div>

      {previewHeaders.length > 0 ? (
        <dl className="mt-1 divide-y divide-border">
          {previewHeaders.map((header) => (
            <ViewerDataFieldCard
              key={`${row.__rowId}-${header}`}
              header={header}
              value={row[header]}
              compact
            />
          ))}
        </dl>
      ) : null}

      {overflowHeaders.length > 0 ? (
        <ViewerMobileOverflowFields row={row} headers={overflowHeaders} />
      ) : null}
    </article>
  );
}

export const ViewerMobileCard = memo(ViewerMobileCardImpl);

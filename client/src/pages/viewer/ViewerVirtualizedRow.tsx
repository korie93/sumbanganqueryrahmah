import { memo } from "react";
import type { ListChildComponentProps } from "react-window";
import { Checkbox } from "@/components/ui/checkbox";
import { PositionedRowShell, ViewerGridShell } from "@/pages/viewer/viewer-grid-shell";
import { buildViewerRowAriaLabel } from "@/pages/viewer/viewer-row-aria";
import type { ViewerVirtualRowData } from "@/pages/viewer/types";

function ViewerVirtualizedRowImpl({
  index,
  style,
  data,
}: ListChildComponentProps<ViewerVirtualRowData>) {
  const row = data.rows[index];
  const selected = data.selectedRowIds.has(row.__rowId);

  return (
    <PositionedRowShell positionStyle={style}>
      <ViewerGridShell
        ariaLabel={buildViewerRowAriaLabel({
          row,
          visibleHeaders: data.visibleHeaders,
        })}
        gridTemplateColumns={data.gridTemplateColumns}
        className={`h-[48px] items-center border-t border-border px-0 hover:bg-muted/50 ${selected ? "bg-primary/10" : ""}`}
      >
        <div className="px-3">
          <Checkbox
            checked={selected}
            onCheckedChange={() => data.onToggleRowSelection(row.__rowId)}
          />
        </div>
        <div className="px-3 text-muted-foreground">{row.__rowId + 1}</div>
        {data.visibleHeaders.map((header) => {
          const cellText = String(row[header] ?? "-");

          return (
            <div
              key={`${row.__rowId}-${header}`}
              className="truncate whitespace-nowrap px-3 text-foreground"
              title={cellText}
              aria-label={cellText}
            >
              {cellText}
            </div>
          );
        })}
      </ViewerGridShell>
    </PositionedRowShell>
  );
}

function areVirtualizedRowPropsEqual(
  previous: ListChildComponentProps<ViewerVirtualRowData>,
  next: ListChildComponentProps<ViewerVirtualRowData>,
) {
  return previous.index === next.index
    && previous.data === next.data
    && previous.style.top === next.style.top
    && previous.style.left === next.style.left
    && previous.style.width === next.style.width
    && previous.style.height === next.style.height;
}

export const ViewerVirtualizedRow = memo(ViewerVirtualizedRowImpl, areVirtualizedRowPropsEqual);

import { memo } from "react";
import type { ListChildComponentProps } from "react-window";
import { Checkbox } from "@/components/ui/checkbox";
import { PositionedRowShell, ViewerGridShell } from "@/pages/viewer/viewer-grid-shell";
import {
  buildViewerRowAriaLabel,
  formatViewerCellValue,
} from "@/pages/viewer/viewer-row-aria";
import type { ViewerVirtualRowData } from "@/pages/viewer/types";
import { getViewerColumnPresentation } from "@/pages/viewer/viewer-column-presentation";
import { ViewerRowDetailsButton } from "@/pages/viewer/ViewerRowDetailsButton";
import styles from "./ViewerDataTable.module.css";

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
        className={`${styles.dataRow} ${selected ? styles.selectedRow : ""} h-full items-center border-t border-border px-0 hover:bg-muted/50 ${
          selected ? "bg-primary/10" : ""
        }`}
      >
        <div className={data.density === "compact" ? "px-2" : "px-3"}>
          <Checkbox
            checked={selected}
            onCheckedChange={() => data.onToggleRowSelection(row.__rowId)}
            aria-label={`Select row ${row.__rowId + 1}`}
          />
        </div>
        <div className={`${data.density === "compact" ? "px-2" : "px-3"} text-muted-foreground`}>
          {row.__rowId + 1}
        </div>
        {data.visibleHeaders.map((header) => {
          const cellText = formatViewerCellValue(row[header]);

          return (
            <div
              key={`${row.__rowId}-${header}`}
              className={`${header === data.pinnedColumn ? styles.pinnedCell : ""} truncate whitespace-nowrap px-3 text-foreground`}
              title={cellText}
              aria-label={cellText}
              data-align={getViewerColumnPresentation(header, data.density).align}
              data-viewer-column={header}
              data-viewer-pinned={header === data.pinnedColumn ? "true" : undefined}
            >
              <span className={styles.gridCellText}>{cellText}</span>
            </div>
          );
        })}
        <div className="flex justify-center px-2">
          <ViewerRowDetailsButton row={row} onInspectRow={data.onInspectRow} />
        </div>
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

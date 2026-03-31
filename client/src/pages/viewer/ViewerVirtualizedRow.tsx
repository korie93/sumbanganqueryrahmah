import type { ListChildComponentProps } from "react-window";
import { Checkbox } from "@/components/ui/checkbox";
import { PositionedRowShell, ViewerGridShell } from "@/pages/viewer/viewer-grid-shell";
import type { ViewerVirtualRowData } from "@/pages/viewer/types";

export function ViewerVirtualizedRow({
  index,
  style,
  data,
}: ListChildComponentProps<ViewerVirtualRowData>) {
  const row = data.rows[index];
  const selected = data.selectedRowIds.has(row.__rowId);

  return (
    <PositionedRowShell positionStyle={style}>
      <ViewerGridShell
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
        {data.visibleHeaders.map((header) => (
          <div
            key={`${row.__rowId}-${header}`}
            className="truncate whitespace-nowrap px-3 text-foreground"
            title={String(row[header] ?? "-")}
          >
            {String(row[header] ?? "-")}
          </div>
        ))}
      </ViewerGridShell>
    </PositionedRowShell>
  );
}

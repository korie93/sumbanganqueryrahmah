import { useRef } from "react";
import { badgeVariants } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { getAriaSelectedProps } from "@/lib/aria-state-props";
import { buildSavedImportRowAriaLabel } from "@/pages/saved/saved-import-row-aria";
import { SavedSourceConfigCardControl } from "@/pages/saved/SavedSourceConfigCardControl";
import { SavedImportActions } from "@/pages/saved/SavedImportActions";
import { useSavedOverlayFocus } from "@/pages/saved/SavedOverlayFocusContext";
import { formatSavedFileSize, getSavedImportSizeBytes, getSavedImportStatus } from "@/pages/saved/saved-workspace";
import type { ImportItem } from "@/pages/saved/types";
import type { SavedListDensity } from "@/pages/saved/useSavedListDensity";
type SavedImportCardProps = {
  actionsDisabled: boolean;
  duplicateHashCounts: ReadonlyMap<string, number>;
  density: SavedListDensity;
  formatDate: (dateStr: string) => string;
  isActive: boolean;
  isSelected: boolean;
  isSuperuser: boolean;
  item: ImportItem;
  onAnalysis: (item: ImportItem) => void;
  onDelete: (item: ImportItem) => void;
  onInspect: (item: ImportItem) => void;
  onRename: (item: ImportItem) => void;
  onToggleSelected: (id: string, checked: boolean) => void;
  onView: (item: ImportItem) => void;
};
const statusToneClassName = {
  default: "border-border bg-muted/45 text-foreground",
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
} as const;
export function SavedImportCard({
  actionsDisabled,
  density,
  duplicateHashCounts,
  formatDate,
  isActive,
  isSelected,
  isSuperuser,
  item,
  onAnalysis,
  onDelete,
  onInspect,
  onRename,
  onToggleSelected,
  onView,
}: SavedImportCardProps) {
  const overlayFocus = useSavedOverlayFocus();
  const selectionRef = useRef<HTMLButtonElement>(null);
  const compact = density === "compact";
  const status = getSavedImportStatus(item, duplicateHashCounts);
  const rowCount = typeof item.rowCount === "number" ? item.rowCount : null;
  const activePressedProps = isActive ? { "aria-pressed": "true" as const } : { "aria-pressed": "false" as const };
  const handleSelectionChange = (checked: boolean) => {
    onToggleSelected(item.id, checked);
    if (checked) {
      overlayFocus?.remember("details", selectionRef.current);
      onInspect(item);
    }
  };
  return (
    <TableRow
      aria-label={buildSavedImportRowAriaLabel({
        formattedCreatedAt: formatDate(item.createdAt),
        item,
      })}
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 p-3 md:table-row md:p-0",
        compact ? "[&>td]:md:py-1" : "[&>td]:md:py-2",
        isSelected || isActive ? "bg-primary/5" : "bg-card",
      )}
      data-density={density}
      data-testid={`card-import-${item.id}`}
      role="row"
      {...getAriaSelectedProps(isSelected || isActive)}
    >
      <TableCell className="col-span-2 block h-auto min-w-0 p-0 md:table-cell md:px-3">
          <div className="flex min-w-0 items-start gap-3">
            {isSuperuser ? (
              <Checkbox
                ref={selectionRef}
                checked={isSelected}
                onCheckedChange={(checked) => handleSelectionChange(Boolean(checked))}
                aria-label={`Select ${item.name}`}
                disabled={actionsDisabled}
                className="mt-3 md:mt-2"
              />
            ) : null}
            <button
              type="button"
              className="min-h-11 min-w-0 flex-1 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:min-h-9"
              onClick={(event) => {
                overlayFocus?.remember("details", event.currentTarget);
                onInspect(item);
              }}
              {...activePressedProps}
              data-testid={`button-select-import-${item.id}`}
            >
              <span className="block min-w-0 space-y-1">
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="min-w-0 break-words text-sm font-medium text-foreground [overflow-wrap:anywhere]">
                      {item.name}
                    </span>
                    <span
                      className={cn(
                        badgeVariants({ variant: "outline" }),
                        statusToneClassName[status.tone],
                      )}
                    >
                      {status.label}
                    </span>
                  </span>
                  {item.filename !== item.name ? (
                    <span className="block break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">{item.filename}</span>
                  ) : null}
              </span>
            </button>
          </div>
      </TableCell>
      <TableCell className="col-span-2 block h-auto min-w-0 p-0 text-xs md:table-cell md:px-3">
        <span className="block text-muted-foreground"><span className="md:sr-only">Imported </span>{formatDate(item.createdAt)}</span>
        <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
          {rowCount !== null ? <span className="tabular-nums">{rowCount.toLocaleString()} rows</span> : null}
          <span>{formatSavedFileSize(getSavedImportSizeBytes(item))}</span>
        </span>
      </TableCell>
      {isSuperuser ? (
        <TableCell className="block h-auto min-w-0 p-0 md:table-cell md:px-1">
          <span className="sr-only">Collection source: </span>
          <SavedSourceConfigCardControl compact disabled={actionsDisabled} item={item} />
        </TableCell>
      ) : null}
      <TableCell className={cn("block h-auto p-0 md:table-cell md:px-3", !isSuperuser && "col-span-2")}>
        <SavedImportActions
          actionsDisabled={actionsDisabled}
          isActive={isActive}
          isSuperuser={isSuperuser}
          item={item}
          onAnalysis={onAnalysis}
          onDelete={onDelete}
          onInspect={onInspect}
          onRename={onRename}
          onView={onView}
        />
      </TableCell>
    </TableRow>
  );
}

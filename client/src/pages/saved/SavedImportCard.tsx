import { BarChart3, BookMarked, Edit2, Eye, Info, Trash2 } from "lucide-react";
import { MobileActionMenu } from "@/components/data/MobileActionMenu";
import { badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { buildSavedImportRowAriaLabel } from "@/pages/saved/saved-import-row-aria";
import { SavedSourceConfigCardControl } from "@/pages/saved/SavedSourceConfigCardControl";
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
  success: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  warning: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  danger: "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200",
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
  const compact = density === "compact";
  const status = getSavedImportStatus(item, duplicateHashCounts);
  const rowCount = typeof item.rowCount === "number" ? item.rowCount : null;
  const actionClassName = cn("w-full sm:w-auto", compact && "h-8 px-2 text-xs");
  const actionIconClassName = cn("h-4 w-4", compact ? "mr-1.5" : "mr-2");
  const activePressedProps = isActive ? { "aria-pressed": "true" as const } : { "aria-pressed": "false" as const };
  const handleSelectionChange = (checked: boolean) => {
    onToggleSelected(item.id, checked);
    if (checked) { onInspect(item); }
  };
  return (
    <div
      aria-label={buildSavedImportRowAriaLabel({
        formattedCreatedAt: formatDate(item.createdAt),
        item,
      })}
      className={cn(
        "rounded-xl border bg-background/70 shadow-sm transition-colors",
        compact ? "p-2.5 sm:p-3" : "p-3 sm:p-4",
        isSelected || isActive ? "border-primary/45 bg-primary/5" : "border-border/70",
      )}
      data-density={density}
      data-testid={`card-import-${item.id}`}
      role="group"
    >
      <div className={cn(
        "grid xl:grid-cols-[minmax(0,1fr)_auto]",
        compact ? "gap-2 xl:gap-3" : "gap-3 xl:gap-4",
      )}>
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            {isSuperuser ? (
              <Checkbox
                checked={isSelected}
                onCheckedChange={(checked) => handleSelectionChange(Boolean(checked))}
                aria-label={`Select ${item.name}`}
                disabled={actionsDisabled}
                className="mt-2"
              />
            ) : null}
            <button
              type="button"
              className="flex min-w-0 flex-1 items-start gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              onClick={() => onInspect(item)}
              {...activePressedProps}
              data-testid={`button-select-import-${item.id}`}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <BookMarked className="h-5 w-5 text-primary" />
              </span>
              <span className={cn("min-w-0", compact ? "space-y-1.5" : "space-y-2")}>
                <span className="block space-y-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="break-words text-sm font-medium text-foreground sm:text-base">
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
                  <span className="block break-words text-sm text-muted-foreground">{item.filename}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-border/70 bg-muted/50 px-2 py-1 text-2xs font-medium text-foreground/80">
                    Imported {formatDate(item.createdAt)}
                  </span>
                  {rowCount !== null ? (
                    <span className="rounded-full border border-border/70 bg-background px-2 py-1 text-2xs font-medium text-muted-foreground">
                      {rowCount.toLocaleString()} rows
                    </span>
                  ) : null}
                  <span className="rounded-full border border-border/70 bg-background px-2 py-1 text-2xs font-medium text-muted-foreground">
                    {formatSavedFileSize(getSavedImportSizeBytes(item))}
                  </span>
                </span>
              </span>
            </button>
          </div>
          {isSuperuser ? (
            <div className="flex shrink-0 items-start justify-end md:hidden">
              <MobileActionMenu
                contentLabel="Saved file actions"
                items={[
                  {
                    id: `rename-${item.id}`,
                    label: "Rename",
                    icon: Edit2,
                    onSelect: () => onRename(item),
                    disabled: actionsDisabled,
                  },
                  {
                    id: `delete-${item.id}`,
                    label: "Delete",
                    icon: Trash2,
                    onSelect: () => onDelete(item),
                    disabled: actionsDisabled,
                    destructive: true,
                  },
                ]}
              />
            </div>
          ) : null}
        </div>
        <div className={cn(
          "grid grid-cols-1 sm:flex sm:flex-wrap sm:items-center xl:max-w-[40rem] xl:justify-end xl:self-start",
          compact ? "gap-1.5" : "gap-2",
        )}>
          <Button
            variant="outline"
            className={actionClassName}
            onClick={() => onView(item)}
            data-testid={`button-view-${item.id}`}
          >
            <Eye className={actionIconClassName} />
            View
          </Button>
          <Button
            variant="outline"
            className={actionClassName}
            onClick={() => onAnalysis(item)}
            data-testid={`button-analysis-${item.id}`}
          >
            <BarChart3 className={actionIconClassName} />
            Analysis
          </Button>
          <Button
            variant="outline"
            className={actionClassName}
            onClick={() => onInspect(item)}
            {...activePressedProps}
            data-testid={`button-inspect-${item.id}`}
          >
            <Info className={actionIconClassName} />
            {isActive ? "Selected" : "Details"}
          </Button>
          {isSuperuser ? (
            <Button
              variant="outline"
              className={cn(actionClassName, "hidden md:inline-flex")}
              onClick={() => onRename(item)}
              disabled={actionsDisabled}
              data-testid={`button-rename-${item.id}`}
            >
              <Edit2 className={actionIconClassName} />
              Rename
            </Button>
          ) : null}
          {isSuperuser ? (
            <Button
              variant="outline"
              className={cn(actionClassName, "hidden text-destructive md:inline-flex")}
              onClick={() => onDelete(item)}
              disabled={actionsDisabled}
              data-testid={`button-delete-${item.id}`}
            >
              <Trash2 className={actionIconClassName} />
              Delete
            </Button>
          ) : null}
        </div>
      </div>
      {isSuperuser ? <SavedSourceConfigCardControl disabled={actionsDisabled} item={item} /> : null}
    </div>
  );
}

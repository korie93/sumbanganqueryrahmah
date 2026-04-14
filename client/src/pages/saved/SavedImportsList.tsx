import { BarChart3, BookMarked, ChevronDown, Edit2, Eye, Search, Trash2 } from "lucide-react";
import { MobileActionMenu } from "@/components/data/MobileActionMenu";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { buildSavedImportRowAriaLabel } from "@/pages/saved/saved-import-row-aria";
import type { ImportItem } from "@/pages/saved/types";

interface SavedImportsListProps {
  imports: ImportItem[];
  summaryLabel: string;
  isSuperuser: boolean;
  filesOpen: boolean;
  actionsDisabled: boolean;
  onFilesOpenChange: (open: boolean) => void;
  onView: (item: ImportItem) => void;
  onRename: (item: ImportItem) => void;
  onAnalysis: (item: ImportItem) => void;
  onDelete: (item: ImportItem) => void;
  onToggleSelected: (id: string, checked: boolean) => void;
  onToggleSelectAllVisible: (checked: boolean) => void;
  formatDate: (dateStr: string) => string;
  selectedImportIds: Set<string>;
  allVisibleSelected: boolean;
  partiallySelected: boolean;
}

export function SavedImportsList({
  imports,
  summaryLabel,
  isSuperuser,
  filesOpen,
  actionsDisabled,
  onFilesOpenChange,
  onView,
  onRename,
  onAnalysis,
  onDelete,
  onToggleSelected,
  onToggleSelectAllVisible,
  formatDate,
  selectedImportIds,
  allVisibleSelected,
  partiallySelected,
}: SavedImportsListProps) {
  if (imports.length === 0) {
    return (
      <div className="ops-empty-state">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
          <Search className="w-8 h-8 text-muted-foreground" />
        </div>
        <p className="text-foreground font-medium mb-2">No results found</p>
        <p className="text-sm text-muted-foreground mb-4">
          Try adjusting your search or filter criteria.
        </p>
      </div>
    );
  }

  return (
    <Collapsible open={filesOpen} onOpenChange={onFilesOpenChange}>
      <div className="rounded-xl border border-border/70 bg-background/80 p-3 shadow-sm sm:p-4">
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="h-auto w-full items-start justify-between gap-3 p-0 text-left"
            data-testid="button-toggle-files"
          >
            <div className="flex min-w-0 items-start gap-2">
              <BookMarked className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground">Saved Files</span>
                  <span className="text-xs text-muted-foreground sm:text-sm">({summaryLabel})</span>
                </div>
                <p className="text-xs text-muted-foreground sm:hidden">
                  Reopen files quickly or continue to Viewer and Analysis.
                </p>
              </div>
            </div>
            <ChevronDown
              className={`mt-0.5 h-5 w-5 shrink-0 text-muted-foreground transition-transform ${
                filesOpen ? "rotate-180" : ""
              }`}
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-4 max-h-[400px] overflow-y-auto pr-2 space-y-3">
            {isSuperuser ? (
              <div className="flex items-center gap-3 rounded-md border border-border/70 bg-background/70 px-3 py-2">
                <Checkbox
                  checked={allVisibleSelected || (partiallySelected ? "indeterminate" : false)}
                  onCheckedChange={(checked) => onToggleSelectAllVisible(Boolean(checked))}
                  aria-label="Select all visible imports"
                  disabled={actionsDisabled}
                />
                <span className="text-sm text-muted-foreground">
                  Select all visible files
                </span>
              </div>
            ) : null}

            {imports.map((item) => (
              <div
                key={item.id}
                aria-label={buildSavedImportRowAriaLabel({
                  formattedCreatedAt: formatDate(item.createdAt),
                  item,
                })}
                className={cn(
                  "rounded-xl border bg-background/70 p-3 shadow-sm transition-colors sm:p-4",
                  selectedImportIds.has(item.id)
                    ? "border-primary/45 bg-primary/5"
                    : "border-border/70",
                )}
                data-testid={`card-import-${item.id}`}
                role="group"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    {isSuperuser ? (
                      <Checkbox
                        checked={selectedImportIds.has(item.id)}
                        onCheckedChange={(checked) => onToggleSelected(item.id, Boolean(checked))}
                        aria-label={`Select ${item.name}`}
                        disabled={actionsDisabled}
                        className="mt-2"
                      />
                    ) : null}
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <BookMarked className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 space-y-2">
                      <div className="space-y-1">
                        <h3 className="break-words text-sm font-medium text-foreground sm:text-base">
                          {item.name}
                        </h3>
                        <p className="break-words text-sm text-muted-foreground">
                          {item.filename}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-border/70 bg-muted/50 px-2 py-1 text-[11px] font-medium text-foreground/80">
                          Imported {formatDate(item.createdAt)}
                        </span>
                        {typeof item.rowCount === "number" ? (
                          <span className="rounded-full border border-border/70 bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground">
                            {item.rowCount.toLocaleString()} rows
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start justify-end">
                    {isSuperuser ? (
                      <div className="flex items-start justify-end md:hidden">
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
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() => onView(item)}
                    data-testid={`button-view-${item.id}`}
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    View
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() => onAnalysis(item)}
                    data-testid={`button-analysis-${item.id}`}
                  >
                    <BarChart3 className="mr-2 h-4 w-4" />
                    Analysis
                  </Button>
                  {isSuperuser ? (
                    <Button
                      variant="outline"
                      className="hidden md:inline-flex"
                      onClick={() => onRename(item)}
                      disabled={actionsDisabled}
                      data-testid={`button-rename-${item.id}`}
                    >
                      <Edit2 className="mr-2 h-4 w-4" />
                      Rename
                    </Button>
                  ) : null}
                  {isSuperuser ? (
                    <Button
                      variant="outline"
                      className="hidden text-destructive md:inline-flex"
                      onClick={() => onDelete(item)}
                      disabled={actionsDisabled}
                      data-testid={`button-delete-${item.id}`}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

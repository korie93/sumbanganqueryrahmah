import { BookMarked, ChevronDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { SavedImportCard } from "@/pages/saved/SavedImportCard";
import { SavedListDensityControl } from "@/pages/saved/SavedListDensityControl";
import type { ImportItem } from "@/pages/saved/types";
import { useSavedListDensity } from "@/pages/saved/useSavedListDensity";

interface SavedImportsListProps {
  activeImportId: string | null;
  allVisibleSelected: boolean;
  actionsDisabled: boolean;
  duplicateHashCounts: ReadonlyMap<string, number>;
  filesOpen: boolean;
  formatDate: (dateStr: string) => string;
  imports: ImportItem[];
  isSuperuser: boolean;
  partiallySelected: boolean;
  selectedImportIds: Set<string>;
  summaryLabel: string;
  onAnalysis: (item: ImportItem) => void;
  onDelete: (item: ImportItem) => void;
  onFilesOpenChange: (open: boolean) => void;
  onInspect: (item: ImportItem) => void;
  onRename: (item: ImportItem) => void;
  onToggleSelected: (id: string, checked: boolean) => void;
  onToggleSelectAllVisible: (checked: boolean) => void;
  onView: (item: ImportItem) => void;
}

export function SavedImportsList({
  activeImportId,
  actionsDisabled,
  allVisibleSelected,
  duplicateHashCounts,
  filesOpen,
  formatDate,
  imports,
  isSuperuser,
  onAnalysis,
  onDelete,
  onFilesOpenChange,
  onInspect,
  onRename,
  onToggleSelected,
  onToggleSelectAllVisible,
  onView,
  partiallySelected,
  selectedImportIds,
  summaryLabel,
}: SavedImportsListProps) {
  const listDensity = useSavedListDensity();

  if (imports.length === 0) {
    return (
      <div className="ops-empty-state">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <Search className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="mb-2 font-medium text-foreground">No results found</p>
        <p className="mb-4 text-sm text-muted-foreground">
          Try adjusting your search, date filter, or saved workspace view.
        </p>
      </div>
    );
  }

  return (
    <Collapsible open={filesOpen} onOpenChange={onFilesOpenChange}>
      <div className="rounded-xl border border-border/70 bg-background/80 p-3 shadow-sm sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="h-auto min-w-0 flex-1 items-start justify-between gap-3 p-0 text-left"
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
          <SavedListDensityControl
            value={listDensity.preference}
            onChange={listDensity.setPreference}
          />
        </div>
        <CollapsibleContent>
          <div
            className="
              mt-4 space-y-3
              md:max-h-[clamp(32rem,calc(100dvh-20rem),52rem)]
              md:overflow-y-auto md:scroll-fade-y md:overscroll-contain md:pr-2
              scrollbar-visible md:[scrollbar-gutter:stable]
            "
            data-testid="saved-files-scroll-region"
          >
            {isSuperuser ? (
              <div className="flex items-center gap-3 rounded-md border border-border/70 bg-background/70 px-3 py-2">
                <Checkbox
                  checked={allVisibleSelected || (partiallySelected ? "indeterminate" : false)}
                  onCheckedChange={(checked) => onToggleSelectAllVisible(Boolean(checked))}
                  aria-label="Select all visible imports"
                  disabled={actionsDisabled}
                />
                <span className="text-sm text-muted-foreground">Select all visible files</span>
              </div>
            ) : null}

            {imports.map((item) => (
              <SavedImportCard
                key={item.id}
                actionsDisabled={actionsDisabled}
                duplicateHashCounts={duplicateHashCounts}
                formatDate={formatDate}
                isActive={activeImportId === item.id}
                isSelected={selectedImportIds.has(item.id)}
                isSuperuser={isSuperuser}
                item={item}
                density={listDensity.density}
                onAnalysis={onAnalysis}
                onDelete={onDelete}
                onInspect={onInspect}
                onRename={onRename}
                onToggleSelected={onToggleSelected}
                onView={onView}
              />
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

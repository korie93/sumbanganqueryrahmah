import { RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SavedImportDetailPanel } from "@/pages/saved/SavedImportDetailPanel";
import { SavedImportsList } from "@/pages/saved/SavedImportsList";
import { SavedWorkspacePanel } from "@/pages/saved/SavedWorkspacePanel";
import type { SavedWorkspaceSummary, SavedWorkspaceView } from "@/pages/saved/saved-workspace";
import type { ImportItem } from "@/pages/saved/types";

type SavedImportsWorkspaceProps = {
  activeImport: ImportItem | null;
  activeImportId: string | null;
  actionsDisabled: boolean;
  allVisibleSelected: boolean;
  duplicateHashCounts: ReadonlyMap<string, number>;
  filesOpen: boolean;
  formatDate: (dateStr: string) => string;
  hasActiveFilters: boolean;
  hasMoreImports: boolean;
  imports: ImportItem[];
  isSuperuser: boolean;
  loading: boolean;
  loadingMore: boolean;
  partiallySelected: boolean;
  selectedImportIds: Set<string>;
  summaryLabel: string;
  totalImports: number;
  workspaceResultLabel: string;
  workspaceSummary: SavedWorkspaceSummary;
  workspaceView: SavedWorkspaceView;
  onAnalysis: (item: ImportItem) => void;
  onClearFilters: () => void;
  onDelete: (item: ImportItem) => void;
  onFilesOpenChange: (open: boolean) => void;
  onInspect: (item: ImportItem) => void;
  onLoadMore: () => void;
  onRename: (item: ImportItem) => void;
  onToggleSelected: (id: string, checked: boolean) => void;
  onToggleSelectAllVisible: (checked: boolean) => void;
  onView: (item: ImportItem) => void;
  onWorkspaceViewChange: (view: SavedWorkspaceView) => void;
};

export function SavedImportsWorkspace({
  activeImport,
  activeImportId,
  actionsDisabled,
  allVisibleSelected,
  duplicateHashCounts,
  filesOpen,
  formatDate,
  hasActiveFilters,
  hasMoreImports,
  imports,
  isSuperuser,
  loading,
  loadingMore,
  onAnalysis,
  onClearFilters,
  onDelete,
  onFilesOpenChange,
  onInspect,
  onLoadMore,
  onRename,
  onToggleSelected,
  onToggleSelectAllVisible,
  onView,
  onWorkspaceViewChange,
  partiallySelected,
  selectedImportIds,
  summaryLabel,
  totalImports,
  workspaceResultLabel,
  workspaceSummary,
  workspaceView,
}: SavedImportsWorkspaceProps) {
  const hasNoWorkspaceResults = imports.length === 0 && totalImports > 0;

  return (
    <div className="grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
      <div className="space-y-4">
        <SavedWorkspacePanel
          activeView={workspaceView}
          summary={workspaceSummary}
          onViewChange={onWorkspaceViewChange}
        />
        <SavedImportDetailPanel
          activeImport={activeImport}
          actionsDisabled={actionsDisabled}
          duplicateHashCounts={duplicateHashCounts}
          formatDate={formatDate}
          isSuperuser={isSuperuser}
          onAnalysis={onAnalysis}
          onDelete={onDelete}
          onRename={onRename}
          onView={onView}
        />
      </div>

      <div className="min-w-0 space-y-4">
        {hasNoWorkspaceResults ? (
          <div className="ops-empty-state rounded-xl border border-border/70 bg-background/80">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted sm:h-16 sm:w-16">
              <Search className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="mb-2 font-medium text-foreground">No files in this view</p>
            <p className="mb-4 max-w-md text-sm text-muted-foreground">
              Try another workspace category or clear the current search and date filters.
            </p>
            <div className="grid w-full max-w-sm gap-2 sm:grid-cols-2">
              <Button
                variant="outline"
                onClick={() => onWorkspaceViewChange("all")}
                data-testid="button-show-all-saved"
              >
                Show All
              </Button>
              {hasActiveFilters ? (
                <Button variant="outline" onClick={onClearFilters} data-testid="button-clear-workspace-filters">
                  Clear Filters
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <SavedImportsList
            activeImportId={activeImportId}
            actionsDisabled={actionsDisabled}
            allVisibleSelected={allVisibleSelected}
            duplicateHashCounts={duplicateHashCounts}
            filesOpen={filesOpen}
            formatDate={formatDate}
            imports={imports}
            isSuperuser={isSuperuser}
            onAnalysis={onAnalysis}
            onDelete={onDelete}
            onFilesOpenChange={onFilesOpenChange}
            onInspect={onInspect}
            onRename={onRename}
            onToggleSelected={onToggleSelected}
            onToggleSelectAllVisible={onToggleSelectAllVisible}
            onView={onView}
            partiallySelected={partiallySelected}
            selectedImportIds={selectedImportIds}
            summaryLabel={workspaceResultLabel}
          />
        )}

        {hasMoreImports ? (
          <div className="flex flex-col items-center gap-2 border-t border-border/60 pt-4">
            <p className="text-sm text-muted-foreground">
              Showing {summaryLabel} from the saved import history.
            </p>
            <Button
              variant="outline"
              onClick={onLoadMore}
              disabled={loading || loadingMore}
              data-testid="button-load-more-imports"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${loadingMore ? "animate-spin" : ""}`} />
              {loadingMore ? "Loading more..." : "Load more"}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

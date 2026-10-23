import { useEffect, useMemo, useRef } from "react";
import { AlertCircle, BookMarked, Search } from "lucide-react";
import {
  OperationalPage,
  OperationalSectionCard,
} from "@/components/layout/OperationalPage";
import { Button } from "@/components/ui/button";
import { SavedDialogs } from "@/pages/saved/SavedDialogs";
import { SavedFiltersBar } from "@/pages/saved/SavedFiltersBar";
import { SavedImportsWorkspace } from "@/pages/saved/SavedImportsWorkspace";
import { SavedLoadingSkeleton } from "@/pages/saved/SavedLoadingSkeleton";
import { SavedPageHeader } from "@/pages/saved/SavedPageHeader";
import { SavedWorkspacePanel } from "@/pages/saved/SavedWorkspacePanel";
import { SavedSourceConfigProvider } from "@/pages/saved/SavedSourceConfigProvider";
import { useSavedPageState } from "@/pages/saved/useSavedPageState";
import { SavedOverlayFocusContext } from "@/pages/saved/SavedOverlayFocusContext";
import { createSavedOverlayFocus } from "@/pages/saved/saved-overlay-focus";
import { formatSavedImportDate } from "@/pages/saved/utils";
import type { SavedProps } from "@/pages/saved/types";

export default function Saved({ onNavigate, userRole }: SavedProps) {
  const state = useSavedPageState({ onNavigate, userRole });
  const { searchInputRef } = state;
  const fallbackFocusRef = useRef<HTMLButtonElement>(null);
  const overlayFocus = useMemo(
    () => createSavedOverlayFocus(() => searchInputRef.current ?? fallbackFocusRef.current),
    [searchInputRef],
  );

  useEffect(() => {
    // The lazy route may mount after the assistant has queried its obstacles.
    document.dispatchEvent(new Event("sqr:saved-workspace-ready"));
  }, []);

  return (
    <SavedOverlayFocusContext.Provider value={overlayFocus}>
    <OperationalPage width="wide" className="saved-workspace">
      <SavedPageHeader
        loading={state.loading}
        error={Boolean(state.error)}
        totalImports={state.totalImports}
        filtered={state.hasActiveFilters || state.workspaceView !== "all"}
        selectedCount={state.isSuperuser ? state.selectedImportIds.size : 0}
        actionsDisabled={state.adminActionsDisabled}
        refreshRef={fallbackFocusRef}
        onRefresh={state.handleRefresh}
        onBulkDelete={(trigger) => {
          overlayFocus.remember("bulk-delete", trigger);
          state.setBulkDeleteDialogOpen(true);
        }}
      />

        <section className="min-w-0 space-y-3" aria-label="Search and Filter" data-saved-ai-avoid="true">
          <SavedFiltersBar
            searchTerm={state.searchTerm}
            uploaderFilter={state.uploaderFilter}
            dateFilter={state.dateFilter}
            minRowsFilter={state.minRowsFilter}
            maxRowsFilter={state.maxRowsFilter}
            hasActiveFilters={state.hasActiveFilters}
            searchInputRef={state.searchInputRef}
            onSearchTermChange={state.setSearchTerm}
            onUploaderFilterChange={state.setUploaderFilter}
            onDateFilterChange={state.setDateFilter}
            onMinRowsFilterChange={state.setMinRowsFilter}
            onMaxRowsFilterChange={state.setMaxRowsFilter}
            onClearFilters={state.clearFilters}
          />
          <SavedWorkspacePanel
            activeView={state.workspaceView}
            summary={state.loading || state.error ? undefined : state.workspaceSummary}
            onViewChange={state.setWorkspaceView}
          />
          <p className="sr-only" role="status" aria-atomic="true">
            {state.loading ? "" : state.error
              ? "Saved imports could not be loaded. Try Refresh."
              : `${state.totalImports.toLocaleString()} matching saved files.`}
          </p>
        </section>

      {state.error ? (
        <OperationalSectionCard
          className="border-destructive/35 bg-destructive/5"
          contentClassName="flex items-center gap-2 text-destructive"
        >
          <AlertCircle className="w-5 h-5" />
          <span role="alert">{state.error}</span>
        </OperationalSectionCard>
      ) : null}

      <SavedSourceConfigProvider enabled={state.isSuperuser}>
        {state.error ? null : state.loading ? (
          <SavedLoadingSkeleton />
        ) : !state.hasActiveFilters && state.workspaceView === "all" && state.totalImports === 0 ? (
          <OperationalSectionCard contentClassName="ops-empty-state">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 sm:h-16 sm:w-16">
              <BookMarked className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="mb-2 text-foreground font-medium">No saved data yet</p>
            <p className="mb-4 max-w-md text-sm text-muted-foreground">
              Import a file to start building your saved workspace for Viewer and Analysis.
            </p>
            <Button className="w-full sm:w-auto" onClick={() => onNavigate("import")} data-testid="button-import-new">
              Import Data
            </Button>
          </OperationalSectionCard>
        ) : state.loadedImportCount === 0 && state.hasActiveFilters ? (
          <OperationalSectionCard contentClassName="ops-empty-state">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted sm:h-16 sm:w-16">
              <Search className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="mb-2 text-foreground font-medium">No matching files</p>
            <p className="mb-4 max-w-md text-sm text-muted-foreground">
              Try a broader search term or remove the date filter to see more saved imports.
            </p>
            <Button
              className="w-full sm:w-auto"
              variant="outline"
              onClick={state.clearFilters}
              data-testid="button-clear-filters-empty"
            >
              Clear Filters
            </Button>
          </OperationalSectionCard>
        ) : (
            <SavedImportsWorkspace
              activeImport={state.activeImport}
              activeImportId={state.activeImportId}
              actionsDisabled={state.adminActionsDisabled}
              allVisibleSelected={state.allVisibleSelected}
              duplicateHashCounts={state.duplicateHashCounts}
              filesOpen={state.filesOpen}
              formatDate={formatSavedImportDate}
              hasActiveFilters={state.hasActiveFilters}
              imports={state.visibleImports}
              isSuperuser={state.isSuperuser}
              loading={state.loading}
              page={state.page}
              pageSize={state.pageSize}
              partiallySelected={state.partiallySelected}
              selectedImportIds={state.selectedImportIds}
              totalImports={state.totalImports}
              totalPages={state.totalPages}
              workspaceResultLabel={state.workspaceResultLabel}
              onAnalysis={state.handleAnalysis}
              onCloseDetails={state.handleCloseImportDetails}
              onCompare={state.handleCompare}
              onClearFilters={state.clearFilters}
              onDelete={state.handleDeleteClick}
              onFilesOpenChange={state.setFilesOpen}
              onInspect={state.handleInspectImport}
              onPageChange={state.setPage}
              onPageSizeChange={state.setPageSize}
              onRename={state.handleRenameClick}
              onToggleSelected={state.handleToggleSelected}
              onToggleSelectAllVisible={state.handleToggleSelectAllVisible}
              onView={state.handleView}
              onWorkspaceViewChange={state.setWorkspaceView}
            />
        )}
      </SavedSourceConfigProvider>

      <SavedDialogs
        deleteDialogOpen={state.deleteDialogOpen}
        renameDialogOpen={state.renameDialogOpen}
        bulkDeleteDialogOpen={state.bulkDeleteDialogOpen}
        deleting={state.deleting}
        renaming={state.renaming}
        bulkDeleting={state.bulkDeleting}
        bulkDeleteCount={state.selectedImportIds.size}
        selectedImport={state.selectedImport}
        newName={state.newName}
        onDeleteDialogOpenChange={state.setDeleteDialogOpen}
        onRenameDialogOpenChange={state.setRenameDialogOpen}
        onBulkDeleteDialogOpenChange={state.setBulkDeleteDialogOpen}
        onNewNameChange={state.setNewName}
        onDeleteConfirm={state.handleDeleteConfirm}
        onRenameConfirm={state.handleRenameConfirm}
        onBulkDeleteConfirm={state.handleBulkDeleteConfirm}
      />
    </OperationalPage>
    </SavedOverlayFocusContext.Provider>
  );
}

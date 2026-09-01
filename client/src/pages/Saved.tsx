import { AlertCircle, BookMarked, RefreshCw, Search, Trash2 } from "lucide-react";
import {
  OperationalPage,
  OperationalPageHeader,
  OperationalSectionCard,
} from "@/components/layout/OperationalPage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SavedDialogs } from "@/pages/saved/SavedDialogs";
import { SavedFiltersBar } from "@/pages/saved/SavedFiltersBar";
import { SavedImportsWorkspace } from "@/pages/saved/SavedImportsWorkspace";
import { SavedLoadingSkeleton } from "@/pages/saved/SavedLoadingSkeleton";
import { SavedSourceConfigProvider } from "@/pages/saved/SavedSourceConfigProvider";
import { useSavedPageState } from "@/pages/saved/useSavedPageState";
import { formatSavedImportDate } from "@/pages/saved/utils";
import type { SavedProps } from "@/pages/saved/types";

export default function Saved({ onNavigate, userRole }: SavedProps) {
  const state = useSavedPageState({ onNavigate, userRole });

  return (
    <OperationalPage width="wide">
      <OperationalPageHeader
        title="Saved Imports"
        eyebrow="Imported Data"
        description={
          <>
            <span className="sm:hidden">
              Reopen Viewer or Analysis quickly and keep imported files tidy.
            </span>
            <span className="hidden sm:inline">
              Review imported files, reopen Viewer or Analysis quickly, and keep operational datasets organized.
            </span>
          </>
        }
        badge={
          !state.loading && state.totalImports > 0 ? (
            <Badge
              variant="secondary"
              className="rounded-full px-2.5 py-1 text-xs font-medium"
              data-testid="text-import-count"
            >
              {state.hasActiveFilters
                ? `${state.visibleImports.length} of ${state.totalImports}`
                : state.importSummaryLabel}
            </Badge>
          ) : null
        }
        actions={
          <>
            {state.isSuperuser && state.selectedImportIds.size > 0 ? (
              <Button
                variant="destructive"
                className="h-9 px-3 sm:h-10 sm:px-4"
                onClick={() => state.setBulkDeleteDialogOpen(true)}
                disabled={state.adminActionsDisabled}
                data-testid="button-bulk-delete"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                <span className="sm:hidden">Delete ({state.selectedImportIds.size})</span>
                <span className="hidden sm:inline">Delete Selected ({state.selectedImportIds.size})</span>
              </Button>
            ) : null}
            <Button
              variant="outline"
              className="h-9 px-3 sm:h-10 sm:px-4"
              onClick={state.handleRefresh}
              disabled={state.adminActionsDisabled}
              data-testid="button-refresh"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${state.loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </>
        }
      />

      {!state.loading && state.totalImports > 0 ? (
        <OperationalSectionCard
          title={
            <>
              <span className="sm:hidden">Filters</span>
              <span className="hidden sm:inline">Search and Filter</span>
            </>
          }
          description={
            <span className="hidden sm:inline">
              Narrow the list without losing your current page context.
            </span>
          }
          contentClassName="space-y-0"
        >
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
        </OperationalSectionCard>
      ) : null}

      {state.error ? (
        <OperationalSectionCard
          className="border-destructive/35 bg-destructive/5"
          contentClassName="flex items-center gap-2 text-destructive"
        >
          <AlertCircle className="w-5 h-5" />
          <span>{state.error}</span>
        </OperationalSectionCard>
      ) : null}

      <SavedSourceConfigProvider enabled={state.isSuperuser}>
        {state.loading ? (
          <SavedLoadingSkeleton />
        ) : !state.hasActiveFilters && state.totalImports === 0 ? (
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
        ) : state.loadedImportCount === 0 ? (
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
          <OperationalSectionCard contentClassName="space-y-0 p-3 sm:p-4 xl:p-5">
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
              workspaceSummary={state.workspaceSummary}
              workspaceView={state.workspaceView}
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
          </OperationalSectionCard>
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
  );
}

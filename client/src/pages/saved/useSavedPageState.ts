import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getBrowserLocalStorage,
  getBrowserSessionStorage,
  safeRemoveStorageItem,
  safeSetStorageItem,
} from "@/lib/browser-storage";
import { usePageShortcuts } from "@/hooks/usePageShortcuts";
import { useToast } from "@/hooks/use-toast";
import type { SavedProps } from "@/pages/saved/types";
import {
  buildSavedImportSummaryLabel,
  countSavedSelectedVisibleImports,
  pruneSavedSelectedImportIds,
  toggleSavedImportSelection,
  toggleSavedVisibleImportSelection,
} from "@/pages/saved/saved-state-utils";
import { useSavedDataState } from "@/pages/saved/useSavedDataState";
import { useSavedMutationState } from "@/pages/saved/useSavedMutationState";
import { useSavedWorkspaceState } from "@/pages/saved/useSavedWorkspaceState";

export function useSavedPageState({ onNavigate, userRole }: SavedProps) {
  const isSuperuser = userRole === "superuser";
  const [filesOpen, setFilesOpen] = useState(true);
  const [selectedImportIds, setSelectedImportIds] = useState<Set<string>>(new Set());
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();

  const data = useSavedDataState();
  const loadedImports = data.imports;
  const workspace = useSavedWorkspaceState({
    hasMoreImports: data.hasMoreImports,
    imports: loadedImports,
    totalImports: data.totalImports,
    workspaceView: data.workspaceView,
    onWorkspaceViewChange: data.setWorkspaceView,
  });
  const visibleImports = workspace.visibleImports;

  useEffect(() => {
    setSelectedImportIds((previous) => pruneSavedSelectedImportIds(previous, visibleImports));
  }, [visibleImports]);

  usePageShortcuts([
    {
      key: "/",
      enabled: !data.loading,
      handler: () => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      },
    },
  ]);

  const clearSelectedImports = useCallback(() => {
    setSelectedImportIds((previous) => (previous.size === 0 ? previous : new Set<string>()));
  }, []);

  const pruneDeletedImportSelection = useCallback((importId: string) => {
    setSelectedImportIds((previous) => {
      if (!previous.has(importId)) {
        return previous;
      }
      const next = new Set(previous);
      next.delete(importId);
      return next;
    });
  }, []);

  const mutation = useSavedMutationState({
    selectedImportIds,
    onImportRenamed: data.replaceImportName,
    onImportsRemoved: data.removeImports,
    onSingleImportSelectionRemoved: pruneDeletedImportSelection,
    onBulkDeleteSelectionCleared: clearSelectedImports,
    toast,
  });

  const selectedVisibleCount = useMemo(
    () => countSavedSelectedVisibleImports(visibleImports, selectedImportIds),
    [selectedImportIds, visibleImports],
  );
  const allVisibleSelected = visibleImports.length > 0 && selectedVisibleCount === visibleImports.length;
  const partiallySelected = selectedVisibleCount > 0 && !allVisibleSelected;
  const importSummaryLabel = useMemo(
    () =>
      buildSavedImportSummaryLabel({
        totalImports: data.totalImports,
        visibleImportCount: loadedImports.length,
        hasMoreImports: data.hasMoreImports,
      }),
    [data.hasMoreImports, data.totalImports, loadedImports.length],
  );
  const workspaceResultLabel = useMemo(
    () => `${visibleImports.length} on this page · ${data.totalImports} matching`,
    [data.totalImports, visibleImports.length],
  );
  const adminActionsDisabled =
    data.loading || mutation.deleting || mutation.bulkDeleting || mutation.renaming;

  const handleView = useCallback(
    (importItem: { id: string; name: string }) => {
      const storage = getBrowserLocalStorage();
      safeSetStorageItem(storage, "selectedImportId", importItem.id);
      safeSetStorageItem(storage, "selectedImportName", importItem.name);
      onNavigate("viewer", importItem.id);
    },
    [onNavigate],
  );

  const handleAnalysis = useCallback(
    (importItem: { id: string; name: string }) => {
      const storage = getBrowserLocalStorage();
      safeSetStorageItem(storage, "analysisImportId", importItem.id);
      safeSetStorageItem(storage, "analysisImportName", importItem.name);
      onNavigate("analysis");
    },
    [onNavigate],
  );

  const handleCompare = useCallback(
    (importItem: { id: string }) => {
      const localStorage = getBrowserLocalStorage();
      const sessionStorage = getBrowserSessionStorage();
      safeRemoveStorageItem(localStorage, "analysisImportId");
      safeRemoveStorageItem(localStorage, "analysisImportName");
      safeSetStorageItem(sessionStorage, "analysisWorkspaceSection", "compare");
      safeSetStorageItem(sessionStorage, "analysisComparisonCurrentId", importItem.id);
      onNavigate("analysis");
    },
    [onNavigate],
  );

  const handleToggleSelected = useCallback((id: string, checked: boolean) => {
    setSelectedImportIds((previous) => toggleSavedImportSelection(previous, id, checked));
  }, []);

  const handleToggleSelectAllVisible = useCallback(
    (checked: boolean) => {
      setSelectedImportIds((previous) =>
        toggleSavedVisibleImportSelection(previous, visibleImports, checked),
      );
    },
    [visibleImports],
  );

  const handleRefresh = useCallback(() => {
    void data.refresh();
  }, [data]);

  return {
    isSuperuser,
    loadedImportCount: loadedImports.length,
    visibleImports,
    totalImports: data.totalImports,
    hasMoreImports: data.hasMoreImports,
    loading: data.loading,
    error: data.error,
    page: data.page,
    pageSize: data.pageSize,
    totalPages: data.totalPages,
    searchTerm: data.searchTerm,
    uploaderFilter: data.uploaderFilter,
    dateFilter: data.dateFilter,
    minRowsFilter: data.minRowsFilter,
    maxRowsFilter: data.maxRowsFilter,
    hasActiveFilters: data.hasActiveFilters,
    selectedImportIds,
    activeImport: workspace.activeImport,
    activeImportId: workspace.activeImportId,
    duplicateHashCounts: workspace.duplicateHashCounts,
    filesOpen,
    workspaceView: workspace.workspaceView,
    workspaceSummary: workspace.workspaceSummary,
    workspaceResultLabel,
    searchInputRef,
    importSummaryLabel,
    allVisibleSelected,
    partiallySelected,
    adminActionsDisabled,
    setFilesOpen,
    setWorkspaceView: workspace.setWorkspaceView,
    setBulkDeleteDialogOpen: mutation.setBulkDeleteDialogOpen,
    setDeleteDialogOpen: mutation.setDeleteDialogOpen,
    setRenameDialogOpen: mutation.setRenameDialogOpen,
    setSearchTerm: data.setSearchTerm,
    setUploaderFilter: data.setUploaderFilter,
    setDateFilter: data.setDateFilter,
    setMinRowsFilter: data.setMinRowsFilter,
    setMaxRowsFilter: data.setMaxRowsFilter,
    setPage: data.setPage,
    setPageSize: data.setPageSize,
    clearFilters: data.clearFilters,
    handleRefresh,
    handleView,
    handleAnalysis,
    handleCompare,
    handleToggleSelected,
    handleToggleSelectAllVisible,
    handleInspectImport: workspace.handleInspectImport,
    handleCloseImportDetails: workspace.handleCloseImportDetails,
    handleDeleteClick: mutation.handleDeleteClick,
    handleRenameClick: mutation.handleRenameClick,
    deleteDialogOpen: mutation.deleteDialogOpen,
    renameDialogOpen: mutation.renameDialogOpen,
    bulkDeleteDialogOpen: mutation.bulkDeleteDialogOpen,
    deleting: mutation.deleting,
    renaming: mutation.renaming,
    bulkDeleting: mutation.bulkDeleting,
    selectedImport: mutation.selectedImport,
    newName: mutation.newName,
    setNewName: mutation.setNewName,
    handleDeleteConfirm: mutation.handleDeleteConfirm,
    handleRenameConfirm: mutation.handleRenameConfirm,
    handleBulkDeleteConfirm: mutation.handleBulkDeleteConfirm,
  };
}

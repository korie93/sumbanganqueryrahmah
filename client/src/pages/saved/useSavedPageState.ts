import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

export function useSavedPageState({ onNavigate, userRole }: SavedProps) {
  const isSuperuser = userRole === "superuser";
  const [filesOpen, setFilesOpen] = useState(true);
  const [selectedImportIds, setSelectedImportIds] = useState<Set<string>>(new Set());
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();

  const data = useSavedDataState();
  const visibleImports = data.imports;

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
        visibleImportCount: visibleImports.length,
        hasMoreImports: data.hasMoreImports,
      }),
    [data.hasMoreImports, data.totalImports, visibleImports.length],
  );
  const adminActionsDisabled =
    data.loading || data.loadingMore || mutation.deleting || mutation.bulkDeleting || mutation.renaming;

  const handleView = useCallback(
    (importItem: { id: string; name: string }) => {
      localStorage.setItem("selectedImportId", importItem.id);
      localStorage.setItem("selectedImportName", importItem.name);
      onNavigate("viewer", importItem.id);
    },
    [onNavigate],
  );

  const handleAnalysis = useCallback(
    (importItem: { id: string; name: string }) => {
      localStorage.setItem("analysisImportId", importItem.id);
      localStorage.setItem("analysisImportName", importItem.name);
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

  const handleLoadMore = useCallback(() => {
    void data.loadMore();
  }, [data]);

  return {
    isSuperuser,
    visibleImports,
    totalImports: data.totalImports,
    hasMoreImports: data.hasMoreImports,
    loading: data.loading,
    loadingMore: data.loadingMore,
    error: data.error,
    searchTerm: data.searchTerm,
    dateFilter: data.dateFilter,
    hasActiveFilters: data.hasActiveFilters,
    selectedImportIds,
    filesOpen,
    searchInputRef,
    importSummaryLabel,
    allVisibleSelected,
    partiallySelected,
    adminActionsDisabled,
    setFilesOpen,
    setBulkDeleteDialogOpen: mutation.setBulkDeleteDialogOpen,
    setDeleteDialogOpen: mutation.setDeleteDialogOpen,
    setRenameDialogOpen: mutation.setRenameDialogOpen,
    setSearchTerm: data.setSearchTerm,
    setDateFilter: data.setDateFilter,
    clearFilters: data.clearFilters,
    handleRefresh,
    handleLoadMore,
    handleView,
    handleAnalysis,
    handleToggleSelected,
    handleToggleSelectAllVisible,
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

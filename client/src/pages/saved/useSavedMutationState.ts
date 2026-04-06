import { useCallback, useEffect, useRef, useState } from "react";
import { deleteImport, renameImport } from "@/lib/api";
import type { ImportItem } from "@/pages/saved/types";
import { isSavedAbortError } from "@/pages/saved/saved-state-utils";

type SavedToast = (options: {
  title: string;
  description?: string;
  variant?: "default" | "destructive";
}) => void;

type SavedMutationStateOptions = {
  selectedImportIds: Set<string>;
  onImportRenamed: (importId: string, nextName: string) => void;
  onImportsRemoved: (importIds: string[]) => void;
  onSingleImportSelectionRemoved: (importId: string) => void;
  onBulkDeleteSelectionCleared: () => void;
  toast: SavedToast;
};

export function useSavedMutationState({
  selectedImportIds,
  onImportRenamed,
  onImportsRemoved,
  onSingleImportSelectionRemoved,
  onBulkDeleteSelectionCleared,
  toast,
}: SavedMutationStateOptions) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [selectedImport, setSelectedImport] = useState<ImportItem | null>(null);
  const [newName, setNewName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [renaming, setRenaming] = useState(false);

  const mountedRef = useRef(true);
  const renameAbortControllerRef = useRef<AbortController | null>(null);
  const deleteAbortControllerRef = useRef<AbortController | null>(null);
  const bulkDeleteAbortControllerRef = useRef<AbortController | null>(null);
  const mutationRequestIdRef = useRef(0);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      renameAbortControllerRef.current?.abort();
      deleteAbortControllerRef.current?.abort();
      bulkDeleteAbortControllerRef.current?.abort();
      mutationRequestIdRef.current += 1;
    };
  }, []);

  const handleDeleteClick = useCallback((importItem: ImportItem) => {
    setSelectedImport(importItem);
    setDeleteDialogOpen(true);
  }, []);

  const handleRenameClick = useCallback((importItem: ImportItem) => {
    setSelectedImport(importItem);
    setNewName(importItem.name);
    setRenameDialogOpen(true);
  }, []);

  const runRenameConfirm = useCallback(async () => {
    if (!selectedImport || !newName.trim() || renaming || deleting || bulkDeleting) {
      return;
    }

    setRenaming(true);
    renameAbortControllerRef.current?.abort();
    const controller = new AbortController();
    renameAbortControllerRef.current = controller;
    const requestId = ++mutationRequestIdRef.current;

    try {
      const trimmedName = newName.trim();
      await renameImport(selectedImport.id, trimmedName, { signal: controller.signal });
      if (controller.signal.aborted || requestId !== mutationRequestIdRef.current || !mountedRef.current) {
        return;
      }

      toast({
        title: "Success",
        description: `Name has been updated to "${trimmedName}".`,
      });
      onImportRenamed(selectedImport.id, trimmedName);
    } catch (error: any) {
      if (isSavedAbortError(error) || requestId !== mutationRequestIdRef.current || !mountedRef.current) {
        return;
      }

      toast({
        title: "Failed",
        description: error?.message || "Failed to update name.",
        variant: "destructive",
      });
    } finally {
      if (renameAbortControllerRef.current === controller) {
        renameAbortControllerRef.current = null;
      }
      if (mountedRef.current) {
        setRenaming(false);
        setRenameDialogOpen(false);
        setSelectedImport(null);
        setNewName("");
      }
    }
  }, [bulkDeleting, deleting, newName, onImportRenamed, renaming, selectedImport, toast]);

  const handleRenameConfirm = useCallback(() => {
    void runRenameConfirm();
  }, [runRenameConfirm]);

  const runDeleteConfirm = useCallback(async () => {
    if (!selectedImport || deleting || renaming || bulkDeleting) {
      return;
    }

    setDeleting(true);
    deleteAbortControllerRef.current?.abort();
    const controller = new AbortController();
    deleteAbortControllerRef.current = controller;
    const requestId = ++mutationRequestIdRef.current;

    try {
      const targetImport = selectedImport;
      await deleteImport(targetImport.id, { signal: controller.signal });
      if (controller.signal.aborted || requestId !== mutationRequestIdRef.current || !mountedRef.current) {
        return;
      }

      toast({
        title: "Success",
        description: `"${targetImport.name}" has been deleted.`,
      });
      onImportsRemoved([targetImport.id]);
      onSingleImportSelectionRemoved(targetImport.id);
    } catch (error: any) {
      if (isSavedAbortError(error) || requestId !== mutationRequestIdRef.current || !mountedRef.current) {
        return;
      }

      toast({
        title: "Failed",
        description: error?.message || "Failed to delete data.",
        variant: "destructive",
      });
    } finally {
      if (deleteAbortControllerRef.current === controller) {
        deleteAbortControllerRef.current = null;
      }
      if (mountedRef.current) {
        setDeleting(false);
        setDeleteDialogOpen(false);
        setSelectedImport(null);
      }
    }
  }, [
    bulkDeleting,
    deleting,
    onImportsRemoved,
    onSingleImportSelectionRemoved,
    renaming,
    selectedImport,
    toast,
  ]);

  const handleDeleteConfirm = useCallback(() => {
    void runDeleteConfirm();
  }, [runDeleteConfirm]);

  const runBulkDeleteConfirm = useCallback(async () => {
    const ids = Array.from(selectedImportIds);
    if (ids.length === 0 || bulkDeleting || deleting || renaming) {
      return;
    }

    setBulkDeleting(true);
    bulkDeleteAbortControllerRef.current?.abort();
    const controller = new AbortController();
    bulkDeleteAbortControllerRef.current = controller;
    const requestId = ++mutationRequestIdRef.current;

    try {
      const results = await Promise.allSettled(ids.map((id) => deleteImport(id, { signal: controller.signal })));
      if (controller.signal.aborted || requestId !== mutationRequestIdRef.current || !mountedRef.current) {
        return;
      }

      const deletedIds: string[] = [];
      let failedCount = 0;

      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          deletedIds.push(ids[index]);
          return;
        }
        failedCount += 1;
      });

      if (deletedIds.length > 0) {
        onImportsRemoved(deletedIds);
      }
      onBulkDeleteSelectionCleared();

      if (deletedIds.length > 0 && failedCount === 0) {
        toast({
          title: "Success",
          description: `${deletedIds.length} file(s) deleted.`,
        });
      } else if (deletedIds.length > 0) {
        toast({
          title: "Partial Success",
          description: `${deletedIds.length} deleted, ${failedCount} failed.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Failed",
          description: "No selected files were deleted.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      if (isSavedAbortError(error) || requestId !== mutationRequestIdRef.current || !mountedRef.current) {
        return;
      }

      toast({
        title: "Failed",
        description: error?.message || "Failed to delete selected files.",
        variant: "destructive",
      });
    } finally {
      if (bulkDeleteAbortControllerRef.current === controller) {
        bulkDeleteAbortControllerRef.current = null;
      }
      if (mountedRef.current) {
        setBulkDeleting(false);
        setBulkDeleteDialogOpen(false);
      }
    }
  }, [
    bulkDeleting,
    deleting,
    onBulkDeleteSelectionCleared,
    onImportsRemoved,
    renaming,
    selectedImportIds,
    toast,
  ]);

  const handleBulkDeleteConfirm = useCallback(() => {
    void runBulkDeleteConfirm();
  }, [runBulkDeleteConfirm]);

  return {
    deleteDialogOpen,
    bulkDeleteDialogOpen,
    renameDialogOpen,
    deleting,
    bulkDeleting,
    renaming,
    selectedImport,
    newName,
    setDeleteDialogOpen,
    setBulkDeleteDialogOpen,
    setRenameDialogOpen,
    setNewName,
    handleDeleteClick,
    handleRenameClick,
    handleDeleteConfirm,
    handleRenameConfirm,
    handleBulkDeleteConfirm,
  };
}

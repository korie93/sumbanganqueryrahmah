import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, BookMarked, RefreshCw, Search, Trash2 } from "lucide-react";
import {
  OperationalPage,
  OperationalPageHeader,
  OperationalSectionCard,
} from "@/components/layout/OperationalPage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getImports, deleteImport, renameImport } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { SavedDialogs } from "@/pages/saved/SavedDialogs";
import { SavedFiltersBar } from "@/pages/saved/SavedFiltersBar";
import { SavedImportsList } from "@/pages/saved/SavedImportsList";
import type { ImportItem, SavedProps } from "@/pages/saved/types";
import { formatSavedImportDate } from "@/pages/saved/utils";

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export default function Saved({ onNavigate, userRole }: SavedProps) {
  const isSuperuser = userRole === "superuser";
  const [imports, setImports] = useState<ImportItem[]>([]);
  const [totalImports, setTotalImports] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [selectedImport, setSelectedImport] = useState<ImportItem | null>(null);
  const [selectedImportIds, setSelectedImportIds] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState<Date | undefined>(undefined);
  const [filesOpen, setFilesOpen] = useState(true);
  const mountedRef = useRef(true);
  const fetchAbortControllerRef = useRef<AbortController | null>(null);
  const fetchRequestIdRef = useRef(0);
  const renameAbortControllerRef = useRef<AbortController | null>(null);
  const deleteAbortControllerRef = useRef<AbortController | null>(null);
  const bulkDeleteAbortControllerRef = useRef<AbortController | null>(null);
  const mutationRequestIdRef = useRef(0);
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const { toast } = useToast();
  const hasActiveFilters = searchTerm.trim() !== "" || dateFilter !== undefined;
  const activeCreatedOn = useMemo(
    () => (dateFilter ? dateFilter.toISOString().slice(0, 10) : undefined),
    [dateFilter],
  );
  const visibleImports = imports;
  const selectedVisibleCount = useMemo(
    () => visibleImports.filter((item) => selectedImportIds.has(item.id)).length,
    [visibleImports, selectedImportIds],
  );
  const allVisibleSelected = visibleImports.length > 0 && selectedVisibleCount === visibleImports.length;
  const partiallySelected = selectedVisibleCount > 0 && !allVisibleSelected;
  const hasMoreImports = nextCursor !== null;
  const importSummaryLabel = useMemo(() => {
    if (totalImports <= 0) {
      return "0 files";
    }
    if (hasMoreImports && visibleImports.length < totalImports) {
      return `${visibleImports.length} loaded of ${totalImports}`;
    }
    return `${totalImports} files`;
  }, [hasMoreImports, totalImports, visibleImports.length]);

  useEffect(() => {
    setSelectedImportIds((previous) => {
      if (previous.size === 0) return previous;
      const validIds = new Set(imports.map((item) => item.id));
      let changed = false;
      const next = new Set<string>();
      for (const id of previous) {
        if (validIds.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, [imports]);

  const clearFilters = () => {
    setSearchTerm("");
    setDateFilter(undefined);
  };

  const fetchImports = async (options?: { cursor?: string | null; reset?: boolean }) => {
    const reset = options?.reset !== false;
    fetchAbortControllerRef.current?.abort();
    const controller = new AbortController();
    fetchAbortControllerRef.current = controller;
    const requestId = ++fetchRequestIdRef.current;
    setError("");
    if (reset) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    try {
      const data = await getImports({
        cursor: options?.cursor || undefined,
        limit: 100,
        search: deferredSearchTerm,
        createdOn: activeCreatedOn,
        signal: controller.signal,
      });
      if (controller.signal.aborted || requestId !== fetchRequestIdRef.current || !mountedRef.current) {
        return;
      }

      const nextItems = Array.isArray(data?.imports) ? data.imports : [];
      const nextTotal = typeof data?.pagination?.total === "number" ? data.pagination.total : nextItems.length;
      const nextPageCursor = typeof data?.pagination?.nextCursor === "string" ? data.pagination.nextCursor : null;
      setTotalImports(nextTotal);
      setNextCursor(nextPageCursor);
      setImports((previous) => {
        if (reset) {
          return nextItems;
        }

        const deduped = new Map(previous.map((item) => [item.id, item]));
        for (const item of nextItems) {
          deduped.set(item.id, item);
        }
        return Array.from(deduped.values());
      });
    } catch (err: any) {
      if (isAbortError(err) || requestId !== fetchRequestIdRef.current || !mountedRef.current) {
        return;
      }
      setError(err?.message || "Failed to load data.");
      if (reset) {
        setImports([]);
        setTotalImports(0);
        setNextCursor(null);
      }
    } finally {
      if (fetchAbortControllerRef.current === controller) {
        fetchAbortControllerRef.current = null;
      }
      if (requestId === fetchRequestIdRef.current && mountedRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  };

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      fetchAbortControllerRef.current?.abort();
      renameAbortControllerRef.current?.abort();
      deleteAbortControllerRef.current?.abort();
      bulkDeleteAbortControllerRef.current?.abort();
      fetchRequestIdRef.current += 1;
      mutationRequestIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!mountedRef.current) {
      return;
    }
    void fetchImports({ reset: true });
  }, [activeCreatedOn, deferredSearchTerm]);

  const handleView = (importItem: ImportItem) => {
    localStorage.setItem("selectedImportId", importItem.id);
    localStorage.setItem("selectedImportName", importItem.name);
    onNavigate("viewer", importItem.id);
  };

  const handleDeleteClick = (importItem: ImportItem) => {
    setSelectedImport(importItem);
    setDeleteDialogOpen(true);
  };

  const handleRenameClick = (importItem: ImportItem) => {
    setSelectedImport(importItem);
    setNewName(importItem.name);
    setRenameDialogOpen(true);
  };

  const handleRenameConfirm = async () => {
    if (!selectedImport || !newName.trim() || renaming || deleting || bulkDeleting) return;

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
      setImports((previous) =>
        previous.map((item) =>
          item.id === selectedImport.id ? { ...item, name: trimmedName } : item,
        ),
      );
    } catch (err: any) {
      if (isAbortError(err) || requestId !== mutationRequestIdRef.current || !mountedRef.current) {
        return;
      }
      toast({
        title: "Failed",
        description: err?.message || "Failed to update name.",
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
  };

  const handleAnalysis = (importItem: ImportItem) => {
    localStorage.setItem("analysisImportId", importItem.id);
    localStorage.setItem("analysisImportName", importItem.name);
    onNavigate("analysis");
  };

  const handleDeleteConfirm = async () => {
    if (!selectedImport || deleting || renaming || bulkDeleting) return;

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
      setImports((previous) => previous.filter((item) => item.id !== targetImport.id));
      setTotalImports((previous) => Math.max(0, previous - 1));
      setSelectedImportIds((previous) => {
        if (!previous.has(targetImport.id)) return previous;
        const next = new Set(previous);
        next.delete(targetImport.id);
        return next;
      });
    } catch (err: any) {
      if (isAbortError(err) || requestId !== mutationRequestIdRef.current || !mountedRef.current) {
        return;
      }
      toast({
        title: "Failed",
        description: err?.message || "Failed to delete data.",
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
  };

  const handleBulkDeleteConfirm = async () => {
    const ids = Array.from(selectedImportIds);
    if (ids.length === 0 || bulkDeleting || deleting || renaming) return;

    setBulkDeleting(true);
    bulkDeleteAbortControllerRef.current?.abort();
    const controller = new AbortController();
    bulkDeleteAbortControllerRef.current = controller;
    const requestId = ++mutationRequestIdRef.current;
    try {
      const results = await Promise.allSettled(
        ids.map((id) => deleteImport(id, { signal: controller.signal })),
      );
      if (controller.signal.aborted || requestId !== mutationRequestIdRef.current || !mountedRef.current) {
        return;
      }
      const deletedIds: string[] = [];
      let failedCount = 0;

      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          deletedIds.push(ids[index]);
        } else {
          failedCount += 1;
        }
      });

      if (deletedIds.length > 0) {
        setImports((previous) => previous.filter((item) => !deletedIds.includes(item.id)));
        setTotalImports((previous) => Math.max(0, previous - deletedIds.length));
      }
      setSelectedImportIds(new Set());

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
    } catch (err: any) {
      if (isAbortError(err) || requestId !== mutationRequestIdRef.current || !mountedRef.current) {
        return;
      }
      toast({
        title: "Failed",
        description: err?.message || "Failed to delete selected files.",
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
  };

  const adminActionsDisabled = loading || loadingMore || deleting || bulkDeleting || renaming;

  return (
    <OperationalPage width="content">
      <OperationalPageHeader
        title="Saved Imports"
        eyebrow="Imported Data"
        description="Review imported files, reopen Viewer or Analysis quickly, and keep operational datasets organized."
        badge={
          !loading && totalImports > 0 ? (
            <Badge
              variant="secondary"
              className="rounded-full px-2.5 py-1 text-xs font-medium"
              data-testid="text-import-count"
            >
              {hasActiveFilters
                ? `${visibleImports.length} of ${totalImports}`
                : importSummaryLabel}
            </Badge>
          ) : null
        }
        actions={
          <>
            {isSuperuser && selectedImportIds.size > 0 ? (
              <Button
                variant="destructive"
                onClick={() => setBulkDeleteDialogOpen(true)}
                disabled={adminActionsDisabled}
                data-testid="button-bulk-delete"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Selected ({selectedImportIds.size})
              </Button>
            ) : null}
            <Button
              variant="outline"
              onClick={() => void fetchImports({ reset: true })}
              disabled={adminActionsDisabled}
              data-testid="button-refresh"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </>
        }
      />

      {!loading && totalImports > 0 ? (
        <OperationalSectionCard
          title="Search and Filter"
          description="Narrow the list without losing your current page context."
          contentClassName="space-y-0"
        >
          <SavedFiltersBar
            searchTerm={searchTerm}
            dateFilter={dateFilter}
            hasActiveFilters={hasActiveFilters}
            onSearchTermChange={setSearchTerm}
            onDateFilterChange={setDateFilter}
            onClearFilters={clearFilters}
          />
        </OperationalSectionCard>
      ) : null}

      {error ? (
        <OperationalSectionCard className="border-destructive/35 bg-destructive/5" contentClassName="flex items-center gap-2 text-destructive">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
        </OperationalSectionCard>
      ) : null}

      {loading ? (
        <OperationalSectionCard contentClassName="ops-empty-state">
            <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Loading data...</p>
        </OperationalSectionCard>
      ) : !hasActiveFilters && totalImports === 0 ? (
        <OperationalSectionCard contentClassName="ops-empty-state">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <BookMarked className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-foreground font-medium mb-2">No saved data</p>
            <p className="text-sm text-muted-foreground mb-4">Import new data to get started.</p>
            <Button onClick={() => onNavigate("import")} data-testid="button-import-new">
              Import Data
            </Button>
        </OperationalSectionCard>
      ) : visibleImports.length === 0 ? (
        <OperationalSectionCard contentClassName="ops-empty-state">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-foreground font-medium mb-2">No results found</p>
            <p className="text-sm text-muted-foreground mb-4">
              Try adjusting your search or filter criteria.
            </p>
            <Button variant="outline" onClick={clearFilters} data-testid="button-clear-filters-empty">
              Clear Filters
            </Button>
        </OperationalSectionCard>
      ) : (
        <OperationalSectionCard
          title="Saved Files"
          description="Use Viewer for inspection, open Analysis when needed, and keep destructive actions separate."
          contentClassName="space-y-0"
        >
          <SavedImportsList
            imports={visibleImports}
            summaryLabel={importSummaryLabel}
            isSuperuser={isSuperuser}
            filesOpen={filesOpen}
            actionsDisabled={adminActionsDisabled}
            onFilesOpenChange={setFilesOpen}
            onView={handleView}
            onRename={handleRenameClick}
            onAnalysis={handleAnalysis}
            onDelete={handleDeleteClick}
            onToggleSelected={(id, checked) => {
              setSelectedImportIds((previous) => {
                const next = new Set(previous);
                if (checked) {
                  next.add(id);
                } else {
                  next.delete(id);
                }
                return next;
              });
            }}
            onToggleSelectAllVisible={(checked) => {
              setSelectedImportIds((previous) => {
                const next = new Set(previous);
                for (const item of visibleImports) {
                  if (checked) {
                    next.add(item.id);
                  } else {
                    next.delete(item.id);
                  }
                }
                return next;
              });
            }}
            selectedImportIds={selectedImportIds}
            allVisibleSelected={allVisibleSelected}
            partiallySelected={partiallySelected}
            formatDate={formatSavedImportDate}
          />
          {hasMoreImports ? (
            <div className="mt-4 flex flex-col items-center gap-2 border-t border-border/60 pt-4">
              <p className="text-sm text-muted-foreground">
                Showing {visibleImports.length} of {totalImports} imports.
              </p>
              <Button
                variant="outline"
                onClick={() => void fetchImports({ cursor: nextCursor, reset: false })}
                disabled={loading || loadingMore}
                data-testid="button-load-more-imports"
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${loadingMore ? "animate-spin" : ""}`} />
                {loadingMore ? "Loading more..." : "Load more"}
              </Button>
            </div>
          ) : null}
        </OperationalSectionCard>
      )}

      <SavedDialogs
        deleteDialogOpen={deleteDialogOpen}
        renameDialogOpen={renameDialogOpen}
        bulkDeleteDialogOpen={bulkDeleteDialogOpen}
        deleting={deleting}
        renaming={renaming}
        bulkDeleting={bulkDeleting}
        bulkDeleteCount={selectedImportIds.size}
        selectedImport={selectedImport}
        newName={newName}
        onDeleteDialogOpenChange={setDeleteDialogOpen}
        onRenameDialogOpenChange={setRenameDialogOpen}
        onBulkDeleteDialogOpenChange={setBulkDeleteDialogOpen}
        onNewNameChange={setNewName}
        onDeleteConfirm={handleDeleteConfirm}
        onRenameConfirm={handleRenameConfirm}
        onBulkDeleteConfirm={() => void handleBulkDeleteConfirm()}
      />
    </OperationalPage>
  );
}

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { AlertCircle, BookMarked, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getImports, deleteImport, renameImport } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { SavedDialogs } from "@/pages/saved/SavedDialogs";
import { SavedFiltersBar } from "@/pages/saved/SavedFiltersBar";
import { SavedImportsList } from "@/pages/saved/SavedImportsList";
import type { ImportItem, SavedProps } from "@/pages/saved/types";
import { filterSavedImports, formatSavedImportDate } from "@/pages/saved/utils";

export default function Saved({ onNavigate, userRole }: SavedProps) {
  const isSuperuser = userRole === "superuser";
  const [imports, setImports] = useState<ImportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [selectedImport, setSelectedImport] = useState<ImportItem | null>(null);
  const [newName, setNewName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState<Date | undefined>(undefined);
  const [filesOpen, setFilesOpen] = useState(true);
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const { toast } = useToast();

  const filteredImports = useMemo(
    () => filterSavedImports(imports, deferredSearchTerm, dateFilter),
    [dateFilter, deferredSearchTerm, imports],
  );
  const hasActiveFilters = searchTerm.trim() !== "" || dateFilter !== undefined;

  const clearFilters = () => {
    setSearchTerm("");
    setDateFilter(undefined);
  };

  const fetchImports = async () => {
    setLoading(true);
    setError("");

    try {
      const data = await getImports();
      setImports(data.imports || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchImports();
  }, []);

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
    if (!selectedImport || !newName.trim()) return;

    setRenaming(true);
    try {
      await renameImport(selectedImport.id, newName.trim());
      toast({
        title: "Success",
        description: `Name has been updated to "${newName.trim()}".`,
      });
      setImports((previous) =>
        previous.map((item) =>
          item.id === selectedImport.id ? { ...item, name: newName.trim() } : item,
        ),
      );
    } catch (err: any) {
      toast({
        title: "Failed",
        description: err?.message || "Failed to update name.",
        variant: "destructive",
      });
    } finally {
      setRenaming(false);
      setRenameDialogOpen(false);
      setSelectedImport(null);
      setNewName("");
    }
  };

  const handleAnalysis = (importItem: ImportItem) => {
    localStorage.setItem("analysisImportId", importItem.id);
    localStorage.setItem("analysisImportName", importItem.name);
    onNavigate("analysis");
  };

  const handleDeleteConfirm = async () => {
    if (!selectedImport) return;

    setDeleting(true);
    try {
      await deleteImport(selectedImport.id);
      toast({
        title: "Success",
        description: `"${selectedImport.name}" has been deleted.`,
      });
      setImports((previous) => previous.filter((item) => item.id !== selectedImport.id));
    } catch (err: any) {
      toast({
        title: "Failed",
        description: err?.message || "Failed to delete data.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
      setSelectedImport(null);
    }
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold text-foreground">Saved Imports</h1>
              {!loading && imports.length > 0 ? (
                <span
                  className="text-sm bg-primary/10 text-primary px-2.5 py-1 rounded-full font-medium"
                  data-testid="text-import-count"
                >
                  {hasActiveFilters
                    ? `${filteredImports.length} of ${imports.length}`
                    : `${imports.length} files`}
                </span>
              ) : null}
            </div>
            <p className="text-muted-foreground">List of all imported data</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => void fetchImports()}
              disabled={loading}
              data-testid="button-refresh"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {!loading && imports.length > 0 ? (
          <SavedFiltersBar
            searchTerm={searchTerm}
            dateFilter={dateFilter}
            hasActiveFilters={hasActiveFilters}
            onSearchTermChange={setSearchTerm}
            onDateFilterChange={setDateFilter}
            onClearFilters={clearFilters}
          />
        ) : null}

        {error ? (
          <div className="glass-wrapper p-4 mb-6 flex items-center gap-2 text-destructive">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        ) : null}

        {loading ? (
          <div className="glass-wrapper p-12 text-center">
            <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Loading data...</p>
          </div>
        ) : imports.length === 0 ? (
          <div className="glass-wrapper p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <BookMarked className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-foreground font-medium mb-2">No saved data</p>
            <p className="text-sm text-muted-foreground mb-4">Import new data to get started.</p>
            <Button onClick={() => onNavigate("import")} data-testid="button-import-new">
              Import Data
            </Button>
          </div>
        ) : filteredImports.length === 0 ? (
          <div className="glass-wrapper p-12 text-center">
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
          </div>
        ) : (
          <SavedImportsList
            imports={filteredImports}
            isSuperuser={isSuperuser}
            filesOpen={filesOpen}
            onFilesOpenChange={setFilesOpen}
            onView={handleView}
            onRename={handleRenameClick}
            onAnalysis={handleAnalysis}
            onDelete={handleDeleteClick}
            formatDate={formatSavedImportDate}
          />
        )}
      </div>

      <SavedDialogs
        deleteDialogOpen={deleteDialogOpen}
        renameDialogOpen={renameDialogOpen}
        deleting={deleting}
        renaming={renaming}
        selectedImport={selectedImport}
        newName={newName}
        onDeleteDialogOpenChange={setDeleteDialogOpen}
        onRenameDialogOpenChange={setRenameDialogOpen}
        onNewNameChange={setNewName}
        onDeleteConfirm={handleDeleteConfirm}
        onRenameConfirm={handleRenameConfirm}
      />
    </div>
  );
}

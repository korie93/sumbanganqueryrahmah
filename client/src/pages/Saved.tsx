import { useState, useEffect } from "react";
import { BookMarked, Eye, Trash2, AlertCircle, RefreshCw, Edit2, BarChart3, Search, CalendarIcon, X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getImports, deleteImport, renameImport } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { format, startOfDay } from "date-fns";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface SavedProps {
  onNavigate: (page: string, importId?: string) => void;
  userRole: string;
}

interface ImportItem {
  id: string;
  name: string;
  filename: string;
  createdAt: string;
  rowCount?: number;
}

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
  const { toast } = useToast();

  const filteredImports = imports.filter((item) => {
    const matchesSearch = searchTerm === "" || 
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.filename.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesDate = !dateFilter || (() => {
      const itemDate = new Date(item.createdAt);
      return (
        itemDate.getFullYear() === dateFilter.getFullYear() &&
        itemDate.getMonth() === dateFilter.getMonth() &&
        itemDate.getDate() === dateFilter.getDate()
      );
    })();
    
    return matchesSearch && matchesDate;
  });

  const hasActiveFilters = searchTerm !== "" || dateFilter !== undefined;

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
    fetchImports();
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
      setImports((prev) =>
        prev.map((item) =>
          item.id === selectedImport.id ? { ...item, name: newName.trim() } : item
        )
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
      setImports((prev) => prev.filter((item) => item.id !== selectedImport.id));
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

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold text-foreground">Saved Imports</h1>
              {!loading && imports.length > 0 && (
                <span className="text-sm bg-primary/10 text-primary px-2.5 py-1 rounded-full font-medium" data-testid="text-import-count">
                  {hasActiveFilters ? `${filteredImports.length} of ${imports.length}` : `${imports.length} files`}
                </span>
              )}
            </div>
            <p className="text-muted-foreground">List of all imported data</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={fetchImports} disabled={loading} data-testid="button-refresh">
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {!loading && imports.length > 0 && (
          <div className="glass-wrapper p-4 mb-6">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="relative flex-1 min-w-48 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by name or filename..."
                  className="pl-9"
                  data-testid="input-search-saved"
                />
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={dateFilter ? "border-primary" : ""} data-testid="button-date-filter">
                    <CalendarIcon className="w-4 h-4 mr-2" />
                    {dateFilter ? format(dateFilter, "dd MMM yyyy") : "Filter by date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateFilter}
                    onSelect={(date) => {
                      if (date) {
                        const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0);
                        setDateFilter(localDate);
                      } else {
                        setDateFilter(undefined);
                      }
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-filters">
                  <X className="w-4 h-4 mr-1" />
                  Clear filters
                </Button>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="glass-wrapper p-4 mb-6 flex items-center gap-2 text-destructive">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        )}

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
            <p className="text-sm text-muted-foreground mb-4">Try adjusting your search or filter criteria.</p>
            <Button variant="outline" onClick={clearFilters} data-testid="button-clear-filters-empty">
              Clear Filters
            </Button>
          </div>
        ) : (
          <Collapsible open={filesOpen} onOpenChange={setFilesOpen}>
            <div className="glass-wrapper p-4">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full flex items-center justify-between gap-2 p-0 h-auto" data-testid="button-toggle-files">
                  <div className="flex items-center gap-2">
                    <BookMarked className="w-5 h-5 text-primary" />
                    <span className="font-semibold text-foreground">Saved Files</span>
                    <span className="text-sm text-muted-foreground">({filteredImports.length} files)</span>
                  </div>
                  <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${filesOpen ? "rotate-180" : ""}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-4 max-h-[400px] overflow-y-auto pr-2 space-y-3">
                  {filteredImports.map((item) => (
                    <div
                      key={item.id}
                      className="p-4 rounded-lg border bg-muted/30 flex items-center justify-between gap-4"
                      data-testid={`card-import-${item.id}`}
                    >
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <BookMarked className="w-5 h-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-medium text-foreground truncate">{item.name}</h3>
                          <p className="text-sm text-muted-foreground">
                            {item.filename} • {formatDate(item.createdAt)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleView(item)}
                          data-testid={`button-view-${item.id}`}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          View
                        </Button>
                        {isSuperuser && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRenameClick(item)}
                            data-testid={`button-rename-${item.id}`}
                          >
                            <Edit2 className="w-4 h-4 mr-1" />
                            Rename
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleAnalysis(item)}
                          data-testid={`button-analysis-${item.id}`}
                        >
                          <BarChart3 className="w-4 h-4 mr-1" />
                          Analysis
                        </Button>
                        {isSuperuser && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteClick(item)}
                            className="text-destructive"
                            data-testid={`button-delete-${item.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        )}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Data?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedImport?.name}"? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Import</DialogTitle>
            <DialogDescription>
              Enter a new name for "{selectedImport?.name}"
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New name"
              data-testid="input-rename"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)} disabled={renaming}>
              Cancel
            </Button>
            <Button onClick={handleRenameConfirm} disabled={renaming || !newName.trim()}>
              {renaming ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

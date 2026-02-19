import { useState, useMemo } from "react";
import { Database, RefreshCw, Plus, RotateCcw, Trash2, Clock, User, HardDrive, FileText, Users, Archive, Search, Filter, Calendar, X, ChevronDown, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import jsPDF from "jspdf";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { getBackups, createBackup, restoreBackup, deleteBackup } from "@/lib/api";

interface BackupMetadata {
  importsCount: number;
  dataRowsCount: number;
  usersCount: number;
  auditLogsCount: number;
  createdAt: string;
}

interface BackupRecord {
  id: string;
  name: string;
  createdAt: string;
  createdBy: string;
  metadata: BackupMetadata | null;
}

interface BackupsResponse {
  backups: BackupRecord[];
}

interface RestoreResponse {
  success: boolean;
  message: string;
  stats: {
    imports: number;
    dataRows: number;
    users: number;
    auditLogs: number;
  };
}

const datePresets = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "week", label: "Last 7 Days" },
  { value: "month", label: "Last 30 Days" },
  { value: "quarter", label: "Last 3 Months" },
  { value: "year", label: "This Year" },
  { value: "custom", label: "Custom Date" },
];

const sortOptions = [
  { value: "newest", label: "Newest First" },
  { value: "oldest", label: "Oldest First" },
  { value: "name-asc", label: "Name (A-Z)" },
  { value: "name-desc", label: "Name (Z-A)" },
];

export default function BackupRestore() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showRestoreDialog, setShowRestoreDialog] = useState<BackupRecord | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState<BackupRecord | null>(null);
  const [backupName, setBackupName] = useState("");
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { toast } = useToast();

  const [filtersOpen, setFiltersOpen] = useState(true);
  const [backupsOpen, setBackupsOpen] = useState(true);
  const [searchName, setSearchName] = useState("");
  const [createdByFilter, setCreatedByFilter] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [datePreset, setDatePreset] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [exportingPdf, setExportingPdf] = useState(false);

  const normalizeBackup = (raw: any): BackupRecord => {
    let metadata = raw?.metadata ?? null;
    if (typeof metadata === "string") {
      if (metadata.length > 200_000) {
        metadata = null;
      } else {
      try {
        metadata = JSON.parse(metadata);
      } catch {
        metadata = null;
      }
      }
    }
    return {
      id: String(raw?.id ?? ""),
      name: String(raw?.name ?? ""),
      createdAt: String(raw?.createdAt ?? raw?.created_at ?? new Date().toISOString()),
      createdBy: String(raw?.createdBy ?? raw?.created_by ?? "system"),
      metadata: metadata && typeof metadata === "object" ? metadata : null,
    };
  };

  const { data, isLoading, refetch, isRefetching, error } = useQuery<BackupsResponse>({
    queryKey: ["/api/backups"],
    queryFn: async () => {
      const response = await getBackups();
      const list = Array.isArray(response?.backups) ? response.backups : [];
      return { backups: list.map(normalizeBackup) };
    },
    retry: 1,
  });

  const backups = data?.backups || [];

  const createBackupMutation = useMutation({
    mutationFn: (name: string) => createBackup(name),
    onSuccess: async (createdRaw: any) => {
      const created = normalizeBackup(createdRaw);
      queryClient.setQueryData<BackupsResponse>(["/api/backups"], (prev) => {
        const prevList = prev?.backups ?? [];
        const withoutSame = prevList.filter((b) => b.id !== created.id);
        return { backups: [created, ...withoutSame] };
      });
      toast({
        title: "Success",
        description: "Backup has been successfully created.",
      });
      setShowCreateDialog(false);
      setBackupName("");
      clearAllFilters();
      await queryClient.invalidateQueries({ queryKey: ["/api/backups"] });
      await refetch();
    },
    onError: (err) => {
      console.error("Failed to create backup:", err);
      toast({
        title: "Error",
        description: "Failed to create backup.",
        variant: "destructive",
      });
    },
  });

  const restoreBackupMutation = useMutation({
    mutationFn: (backupId: string) => restoreBackup(backupId) as Promise<RestoreResponse>,
    onSuccess: (result) => {
      toast({
        title: "Success",
        description: result.message || "Backup has been successfully restored.",
      });
      setShowRestoreDialog(null);
      setRestoringId(null);
    },
    onError: (err) => {
      console.error("Failed to restore backup:", err);
      toast({
        title: "Error",
        description: "Failed to restore backup.",
        variant: "destructive",
      });
      setRestoringId(null);
    },
  });

  const deleteBackupMutation = useMutation({
    mutationFn: (backupId: string) => deleteBackup(backupId),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Backup has been successfully deleted.",
      });
      setShowDeleteDialog(null);
      setDeletingId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/backups"] });
    },
    onError: (err) => {
      console.error("Failed to delete backup:", err);
      toast({
        title: "Error",
        description: "Failed to delete backup.",
        variant: "destructive",
      });
      setDeletingId(null);
    },
  });

  const handleCreateBackup = () => {
    if (!backupName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a backup name.",
        variant: "destructive",
      });
      return;
    }
    createBackupMutation.mutate(backupName.trim());
  };

  const handleRestoreBackup = (backup: BackupRecord) => {
    setRestoringId(backup.id);
    restoreBackupMutation.mutate(backup.id);
  };

  const handleDeleteBackup = (backup: BackupRecord) => {
    setDeletingId(backup.id);
    deleteBackupMutation.mutate(backup.id);
  };

  const getDateRange = (preset: string): { from: Date | null; to: Date | null } => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (preset) {
      case "today":
        return { from: today, to: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1) };
      case "yesterday": {
        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
        return { from: yesterday, to: new Date(today.getTime() - 1) };
      }
      case "week": {
        const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        return { from: weekAgo, to: now };
      }
      case "month": {
        const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
        return { from: monthAgo, to: now };
      }
      case "quarter": {
        const quarterAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
        return { from: quarterAgo, to: now };
      }
      case "year": {
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        return { from: startOfYear, to: now };
      }
      case "custom":
        return {
          from: dateFrom ? new Date(dateFrom) : null,
          to: dateTo ? new Date(dateTo + "T23:59:59") : null,
        };
      default:
        return { from: null, to: null };
    }
  };

  const filteredAndSortedBackups = useMemo(() => {
    let filtered = backups.filter((backup) => {
      if (searchName && !backup.name.toLowerCase().includes(searchName.toLowerCase())) {
        return false;
      }

      if (createdByFilter && !backup.createdBy.toLowerCase().includes(createdByFilter.toLowerCase())) {
        return false;
      }

      if (datePreset !== "all") {
        const { from, to } = getDateRange(datePreset);
        const backupDate = new Date(backup.createdAt);
        if (from && backupDate < from) return false;
        if (to && backupDate > to) return false;
      }

      return true;
    });

    filtered.sort((a, b) => {
      switch (sortBy) {
        case "newest":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "oldest":
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "name-asc":
          return a.name.localeCompare(b.name);
        case "name-desc":
          return b.name.localeCompare(a.name);
        default:
          return 0;
      }
    });

    return filtered;
  }, [backups, searchName, createdByFilter, datePreset, dateFrom, dateTo, sortBy]);

  const clearAllFilters = () => {
    setSearchName("");
    setCreatedByFilter("");
    setSortBy("newest");
    setDatePreset("all");
    setDateFrom("");
    setDateTo("");
  };

  const hasActiveFilters = searchName || createdByFilter || sortBy !== "newest" || datePreset !== "all";

  const exportToCSV = () => {
    if (filteredAndSortedBackups.length === 0) return;

    const escapeCSV = (value: string) => `"${(value || "").replace(/"/g, '""')}"`;
    
    const headers = ["Name", "Created By", "Created At", "Imports", "Data Rows", "Users", "Audit Logs"];
    const csvContent = [
      headers.map(escapeCSV).join(","),
      ...filteredAndSortedBackups.map((backup) =>
        [
          escapeCSV(backup.name),
          escapeCSV(backup.createdBy),
          escapeCSV(formatTime(backup.createdAt)),
          escapeCSV(String(backup.metadata?.importsCount || 0)),
          escapeCSV(String(backup.metadata?.dataRowsCount || 0)),
          escapeCSV(String(backup.metadata?.usersCount || 0)),
          escapeCSV(String(backup.metadata?.auditLogsCount || 0)),
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `SQR-backups-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  const exportToPDF = async () => {
    if (filteredAndSortedBackups.length === 0) return;

    setExportingPdf(true);
    try {
      const isDark = document.documentElement.classList.contains("dark");
      
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 14;
      let yPos = margin;

      pdf.setFillColor(isDark ? 30 : 255, isDark ? 41 : 255, isDark ? 59 : 255);
      pdf.rect(0, 0, pageWidth, pageHeight, "F");

      pdf.setFontSize(18);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(isDark ? 255 : 30);
      pdf.text("Backup Records Report", margin, yPos + 6);
      yPos += 12;

      pdf.setFontSize(10);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(isDark ? 180 : 100);
      pdf.text(`${filteredAndSortedBackups.length} backups | Generated: ${new Date().toLocaleString()}`, margin, yPos);
      yPos += 8;

      pdf.setDrawColor(isDark ? 100 : 200);
      pdf.setLineWidth(0.5);
      pdf.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 6;

      const headers = ["Name", "Created By", "Created At", "Imports", "Data Rows", "Users", "Audit Logs"];
      const colWidths = [50, 35, 50, 25, 30, 25, 30];
      const rowHeight = 7;
      const maxRowsPerPage = Math.floor((pageHeight - yPos - 20) / rowHeight);

      pdf.setFillColor(isDark ? 50 : 230, isDark ? 60 : 230, isDark ? 70 : 235);
      pdf.rect(margin, yPos, pageWidth - margin * 2, rowHeight, "F");
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(isDark ? 255 : 30);
      let xPos = margin;
      headers.forEach((header, i) => {
        pdf.text(header, xPos + 2, yPos + 5);
        xPos += colWidths[i];
      });
      yPos += rowHeight;

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7);
      let rowsOnPage = 0;
      let pageNum = 1;

      filteredAndSortedBackups.forEach((backup, rowIndex) => {
        if (rowsOnPage >= maxRowsPerPage - 1) {
          pdf.setFontSize(8);
          pdf.setTextColor(isDark ? 120 : 150);
          pdf.text(`Page ${pageNum}`, pageWidth - margin - 15, pageHeight - 8);
          pdf.text("SQR System - Backups", margin, pageHeight - 8);
          
          pdf.addPage();
          pageNum++;
          yPos = margin;
          rowsOnPage = 0;

          pdf.setFillColor(isDark ? 30 : 255, isDark ? 41 : 255, isDark ? 59 : 255);
          pdf.rect(0, 0, pageWidth, pageHeight, "F");

          pdf.setFillColor(isDark ? 50 : 230, isDark ? 60 : 230, isDark ? 70 : 235);
          pdf.rect(margin, yPos, pageWidth - margin * 2, rowHeight, "F");
          pdf.setFontSize(8);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(isDark ? 255 : 30);
          xPos = margin;
          headers.forEach((header, i) => {
            pdf.text(header, xPos + 2, yPos + 5);
            xPos += colWidths[i];
          });
          yPos += rowHeight;
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(7);
        }

        if (rowIndex % 2 === 0) {
          pdf.setFillColor(isDark ? 40 : 245, isDark ? 50 : 245, isDark ? 60 : 250);
          pdf.rect(margin, yPos, pageWidth - margin * 2, rowHeight, "F");
        }

        pdf.setTextColor(isDark ? 220 : 50);
        xPos = margin;
        const rowData = [
          backup.name,
          backup.createdBy,
          formatTime(backup.createdAt),
          String(backup.metadata?.importsCount || 0),
          String(backup.metadata?.dataRowsCount || 0),
          String(backup.metadata?.usersCount || 0),
          String(backup.metadata?.auditLogsCount || 0),
        ];
        rowData.forEach((cell, i) => {
          const maxChars = Math.floor(colWidths[i] / 2);
          const text = cell.length > maxChars ? cell.substring(0, maxChars - 2) + ".." : cell;
          pdf.text(text, xPos + 2, yPos + 5);
          xPos += colWidths[i];
        });
        yPos += rowHeight;
        rowsOnPage++;
      });

      pdf.setFontSize(8);
      pdf.setTextColor(isDark ? 120 : 150);
      pdf.text(`Page ${pageNum}`, pageWidth - margin - 15, pageHeight - 8);
      pdf.text("SQR System - Backups", margin, pageHeight - 8);

      pdf.save(`SQR-backups-${new Date().toISOString().split("T")[0]}.pdf`);
    } catch (error: any) {
      console.error("Failed to export PDF:", error);
      toast({
        title: "Export Failed",
        description: error?.message || "Failed to export PDF",
        variant: "destructive",
      });
    } finally {
      setExportingPdf(false);
    }
  };

  const formatTime = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString("en-US", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  const loading = isLoading || isRefetching;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Database className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-backup-title">
              Backup & Restore
            </h1>
            <p className="text-sm text-muted-foreground">
              Create data backups and restore from existing backups
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                disabled={loading || filteredAndSortedBackups.length === 0 || exportingPdf}
                data-testid="button-export-backups"
              >
                {exportingPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                Export
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48" align="end">
              <div className="space-y-1">
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={exportToCSV}
                  data-testid="button-export-csv"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export CSV
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={exportToPDF}
                  disabled={exportingPdf}
                  data-testid="button-export-pdf"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Export PDF
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={loading}
            data-testid="button-refresh-backups"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            onClick={() => setShowCreateDialog(true)}
            data-testid="button-create-backup"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Backup
          </Button>
        </div>
      </div>

      <Card>
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="p-0 h-auto gap-2">
                  <Filter className="h-5 w-5" />
                  <CardTitle className="text-lg">Search & Filters</CardTitle>
                  <ChevronDown className={`h-4 w-4 transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
                </Button>
              </CollapsibleTrigger>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAllFilters}
                  className="text-muted-foreground"
                  data-testid="button-clear-backup-filters"
                >
                  <X className="h-4 w-4 mr-1" />
                  Clear All Filters
                </Button>
              )}
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="search-name" className="text-sm font-medium flex items-center gap-1">
                    <Search className="h-3.5 w-3.5" />
                    Search Name
                  </Label>
                  <Input
                    id="search-name"
                    placeholder="Search backup name..."
                    value={searchName}
                    onChange={(e) => setSearchName(e.target.value)}
                    data-testid="input-search-backup-name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="created-by" className="text-sm font-medium flex items-center gap-1">
                    <User className="h-3.5 w-3.5" />
                    Created By
                  </Label>
                  <Input
                    id="created-by"
                    placeholder="Username..."
                    value={createdByFilter}
                    onChange={(e) => setCreatedByFilter(e.target.value)}
                    data-testid="input-created-by"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    Time Period
                  </Label>
                  <Select value={datePreset} onValueChange={(value) => {
                    setDatePreset(value);
                    if (value !== "custom") {
                      setDateFrom("");
                      setDateTo("");
                    }
                  }}>
                    <SelectTrigger data-testid="select-backup-date-preset">
                      <SelectValue placeholder="Select period" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Time</SelectItem>
                      {datePresets.map((preset) => (
                        <SelectItem key={preset.value} value={preset.value}>
                          {preset.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-1">
                    <Archive className="h-3.5 w-3.5" />
                    Sort By
                  </Label>
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger data-testid="select-backup-sort">
                      <SelectValue placeholder="Select sort order" />
                    </SelectTrigger>
                    <SelectContent>
                      {sortOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {datePreset === "custom" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">From Date</Label>
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      data-testid="input-backup-date-from"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">To Date</Label>
                    <Input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      data-testid="input-backup-date-to"
                    />
                  </div>
                </div>
              )}

              {hasActiveFilters && (
                <div className="flex items-center gap-2 flex-wrap pt-2 border-t">
                  <span className="text-sm text-muted-foreground">Active filters:</span>
                  {searchName && (
                    <Badge variant="secondary" className="gap-1">
                      Name: {searchName}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 p-0 ml-1"
                        onClick={() => setSearchName("")}
                        data-testid="button-clear-name-filter"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  )}
                  {createdByFilter && (
                    <Badge variant="secondary" className="gap-1">
                      By: {createdByFilter}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 p-0 ml-1"
                        onClick={() => setCreatedByFilter("")}
                        data-testid="button-clear-created-by-filter"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  )}
                  {datePreset !== "all" && (
                    <Badge variant="secondary" className="gap-1">
                      Time: {datePreset === "custom" ? `${dateFrom || "?"} - ${dateTo || "?"}` : datePresets.find(p => p.value === datePreset)?.label}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 p-0 ml-1"
                        onClick={() => { setDatePreset("all"); setDateFrom(""); setDateTo(""); }}
                        data-testid="button-clear-backup-date-filter"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  )}
                  {sortBy !== "newest" && (
                    <Badge variant="secondary" className="gap-1">
                      Sort: {sortOptions.find(o => o.value === sortBy)?.label}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 p-0 ml-1"
                        onClick={() => setSortBy("newest")}
                        data-testid="button-clear-sort-filter"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  )}
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="pt-6 flex items-center justify-between gap-3">
            <div className="text-sm text-destructive">
              Failed to load backup list. {(error as Error)?.message || ""}
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      <Collapsible open={backupsOpen} onOpenChange={setBackupsOpen}>
        <Card>
          <CardHeader className="pb-3">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full flex items-center justify-between gap-2 p-0 h-auto" data-testid="button-toggle-backups">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Archive className="h-5 w-5" />
                  Backup List ({filteredAndSortedBackups.length} of {backups.length})
                </CardTitle>
                <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${backupsOpen ? "rotate-180" : ""}`} />
              </Button>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredAndSortedBackups.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  {backups.length === 0 ? (
                    <>
                      <p>No backups found.</p>
                      <p className="text-sm mt-2">Click "Create Backup" to create a new backup.</p>
                    </>
                  ) : (
                    <>
                      <p>No backups match the filters.</p>
                      <Button
                        variant="ghost"
                        onClick={clearAllFilters}
                        className="mt-2"
                        data-testid="button-clear-backup-filters-empty"
                      >
                        Clear all filters
                      </Button>
                    </>
                  )}
                </div>
              ) : (
                <div className="max-h-[400px] overflow-y-auto pr-2 space-y-3">
                  {filteredAndSortedBackups.map((backup) => (
                    <div
                      key={backup.id}
                      className="p-4 rounded-lg border bg-muted/30 space-y-3"
                      data-testid={`backup-item-${backup.id}`}
                    >
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-3">
                          <Badge variant="secondary">{backup.name}</Badge>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <User className="h-4 w-4" />
                            <span data-testid={`text-backup-created-by-${backup.id}`}>
                              {backup.createdBy}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          <span data-testid={`text-backup-date-${backup.id}`}>
                            {formatTime(backup.createdAt)}
                          </span>
                        </div>
                      </div>

                      {backup.metadata && (
                        <div className="flex flex-wrap gap-4 text-sm">
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <HardDrive className="h-4 w-4" />
                            <span>{backup.metadata.importsCount} imports</span>
                          </div>
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <FileText className="h-4 w-4" />
                            <span>{backup.metadata.dataRowsCount} data rows</span>
                          </div>
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Users className="h-4 w-4" />
                            <span>{backup.metadata.usersCount} users</span>
                          </div>
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Archive className="h-4 w-4" />
                            <span>{backup.metadata.auditLogsCount} audit logs</span>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowRestoreDialog(backup)}
                          disabled={restoringId === backup.id}
                          data-testid={`button-restore-${backup.id}`}
                        >
                          <RotateCcw className={`h-4 w-4 mr-2 ${restoringId === backup.id ? "animate-spin" : ""}`} />
                          Restore
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setShowDeleteDialog(backup)}
                          disabled={deletingId === backup.id}
                          data-testid={`button-delete-backup-${backup.id}`}
                        >
                          <Trash2 className={`h-4 w-4 mr-2 ${deletingId === backup.id ? "animate-spin" : ""}`} />
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Backup</DialogTitle>
            <DialogDescription>
              The backup will save all import data, data rows, users, and audit logs.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="backup-name">Backup Name</Label>
              <Input
                id="backup-name"
                placeholder="Example: Daily Backup 07-12-2025"
                value={backupName}
                onChange={(e) => setBackupName(e.target.value)}
                data-testid="input-backup-name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false);
                setBackupName("");
              }}
              data-testid="button-cancel-create"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateBackup}
              disabled={createBackupMutation.isPending || !backupName.trim()}
              data-testid="button-confirm-create"
            >
              {createBackupMutation.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Create Backup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!showRestoreDialog} onOpenChange={() => setShowRestoreDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore Backup?</AlertDialogTitle>
            <AlertDialogDescription>
              You will restore data from backup "{showRestoreDialog?.name}". 
              Existing data will not be overwritten, only new data will be added.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-restore">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => showRestoreDialog && handleRestoreBackup(showRestoreDialog)}
              disabled={restoringId === showRestoreDialog?.id}
              data-testid="button-confirm-restore"
            >
              {restoringId === showRestoreDialog?.id ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!showDeleteDialog} onOpenChange={() => setShowDeleteDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Backup?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete backup "{showDeleteDialog?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => showDeleteDialog && handleDeleteBackup(showDeleteDialog)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deletingId === showDeleteDialog?.id}
              data-testid="button-confirm-delete"
            >
              {deletingId === showDeleteDialog?.id ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

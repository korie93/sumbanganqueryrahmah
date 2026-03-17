import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { Database, Download, FileText, Loader2, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { formatDateTimeDDMMYYYY } from "@/lib/date-format";
import { createBackup, deleteBackup, getBackups, restoreBackup } from "@/lib/api";
import { BackupDialogs } from "@/pages/backup-restore/BackupDialogs";
import { BackupFiltersPanel } from "@/pages/backup-restore/BackupFiltersPanel";
import { BackupList } from "@/pages/backup-restore/BackupList";
import type {
  BackupRecord,
  BackupsResponse,
  BackupRestoreProps,
  RestoreResponse,
} from "@/pages/backup-restore/types";
import {
  exportBackupsToCsv,
  exportBackupsToPdf,
  filterAndSortBackups,
  normalizeBackup,
} from "@/pages/backup-restore/utils";

export default function BackupRestore({ userRole }: BackupRestoreProps) {
  const canManageBackups = userRole === "admin" || userRole === "superuser";
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showRestoreDialog, setShowRestoreDialog] = useState<BackupRecord | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState<BackupRecord | null>(null);
  const [backupName, setBackupName] = useState("");
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [backupsOpen, setBackupsOpen] = useState(true);
  const [searchName, setSearchName] = useState("");
  const [createdByFilter, setCreatedByFilter] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [datePreset, setDatePreset] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [exportingPdf, setExportingPdf] = useState(false);
  const [lastRestoreResult, setLastRestoreResult] = useState<RestoreResponse | null>(null);
  const { toast } = useToast();
  const deferredSearchName = useDeferredValue(searchName.trim());

  const { data, error, isLoading, isRefetching, refetch } = useQuery<BackupsResponse>({
    queryKey: ["/api/backups"],
    queryFn: async () => {
      const response = await getBackups();
      const list = Array.isArray(response?.backups) ? response.backups : [];
      return { backups: list.map(normalizeBackup) };
    },
    retry: 1,
  });

  const backups = data?.backups || [];

  const clearAllFilters = useCallback(() => {
    setSearchName("");
    setCreatedByFilter("");
    setSortBy("newest");
    setDatePreset("all");
    setDateFrom("");
    setDateTo("");
  }, []);

  const createBackupMutation = useMutation({
    mutationFn: (name: string) => createBackup(name),
    onSuccess: async (createdRaw: unknown) => {
      const created = normalizeBackup(createdRaw);
      queryClient.setQueryData<BackupsResponse>(["/api/backups"], (previous) => {
        const previousList = previous?.backups ?? [];
        const withoutSame = previousList.filter((backup) => backup.id !== created.id);
        return { backups: [created, ...withoutSame] };
      });

      toast({
        title: "Success",
        description: "Backup has been successfully created.",
      });

      setShowCreateDialog(false);
      setBackupName("");
      clearAllFilters();

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/backups"] }),
        refetch(),
      ]);
    },
    onError: (error) => {
      console.error("Failed to create backup:", error);
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
      const stats = result.stats;
      const totalRestored = stats.totalInserted + stats.totalReactivated;
      const parts: string[] = [];
      if (stats.imports.inserted + stats.imports.reactivated > 0) {
        parts.push(`${stats.imports.inserted + stats.imports.reactivated} imports`);
      }
      if (stats.dataRows.inserted > 0) {
        parts.push(`${stats.dataRows.inserted} data rows`);
      }
      if (stats.users.inserted > 0) {
        parts.push(`${stats.users.inserted} users`);
      }
      if (stats.auditLogs.inserted > 0) {
        parts.push(`${stats.auditLogs.inserted} audit logs`);
      }
      if (stats.collectionRecords.inserted > 0) {
        parts.push(`${stats.collectionRecords.inserted} collection records`);
      }
      if (stats.collectionRecordReceipts.inserted > 0) {
        parts.push(`${stats.collectionRecordReceipts.inserted} collection receipts`);
      }

      const summary = totalRestored > 0
        ? `Restored: ${parts.join(", ")}.`
        : "No new records were added (data may already exist).";
      const duration = result.durationMs != null
        ? ` Duration: ${(result.durationMs / 1000).toFixed(1)}s.`
        : "";

      toast({
        title: totalRestored > 0 ? "Restore Successful" : "Restore Complete",
        description: `${summary}${duration}`,
        duration: 8000,
      });
      setLastRestoreResult(result);
      setShowRestoreDialog(null);
      setRestoringId(null);
      void queryClient.invalidateQueries({ queryKey: ["/api/backups"] });
    },
    onError: (error) => {
      console.error("Failed to restore backup:", error);
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
    onSuccess: async () => {
      toast({
        title: "Success",
        description: "Backup has been successfully deleted.",
      });
      setShowDeleteDialog(null);
      setDeletingId(null);
      await queryClient.invalidateQueries({ queryKey: ["/api/backups"] });
    },
    onError: (error) => {
      console.error("Failed to delete backup:", error);
      toast({
        title: "Error",
        description: "Failed to delete backup.",
        variant: "destructive",
      });
      setDeletingId(null);
    },
  });

  const filteredAndSortedBackups = useMemo(
    () =>
      filterAndSortBackups(backups, {
        createdByFilter,
        dateFrom,
        datePreset,
        dateTo,
        searchName: deferredSearchName,
        sortBy,
      }),
    [backups, createdByFilter, dateFrom, datePreset, dateTo, deferredSearchName, sortBy],
  );

  const hasActiveFilters =
    Boolean(searchName) ||
    Boolean(createdByFilter) ||
    sortBy !== "newest" ||
    datePreset !== "all";

  const loading = isLoading || isRefetching;

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

  const handleExportPdf = async () => {
    if (filteredAndSortedBackups.length === 0) return;

    setExportingPdf(true);
    try {
      await exportBackupsToPdf(filteredAndSortedBackups);
    } catch (error: unknown) {
      console.error("Failed to export PDF:", error);
      toast({
        title: "Export Failed",
        description: error instanceof Error ? error.message : "Failed to export PDF",
        variant: "destructive",
      });
    } finally {
      setExportingPdf(false);
    }
  };

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
                  onClick={() => exportBackupsToCsv(filteredAndSortedBackups)}
                  data-testid="button-export-csv"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export CSV
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={handleExportPdf}
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
            onClick={() => {
              void refetch();
            }}
            disabled={loading}
            data-testid="button-refresh-backups"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {canManageBackups ? (
            <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-backup">
              <Plus className="h-4 w-4 mr-2" />
              Create Backup
            </Button>
          ) : null}
        </div>
      </div>

      <BackupFiltersPanel
        createdByFilter={createdByFilter}
        dateFrom={dateFrom}
        datePreset={datePreset}
        dateTo={dateTo}
        filtersOpen={filtersOpen}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearAllFilters}
        onCreatedByFilterChange={setCreatedByFilter}
        onDateFromChange={setDateFrom}
        onDatePresetChange={(value) => {
          setDatePreset(value);
          if (value !== "custom") {
            setDateFrom("");
            setDateTo("");
          }
        }}
        onDateToChange={setDateTo}
        onFiltersOpenChange={setFiltersOpen}
        onSearchNameChange={setSearchName}
        onSortByChange={setSortBy}
        searchName={searchName}
        sortBy={sortBy}
      />

      {error ? (
        <Card className="border-destructive/40">
          <CardContent className="pt-6 flex items-center justify-between gap-3">
            <div className="text-sm text-destructive">
              Failed to load backup list. {error instanceof Error ? error.message : ""}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void refetch();
              }}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {lastRestoreResult ? (
        <Card className="border-border/60">
          <CardContent className="pt-6 space-y-3">
            <div className="text-sm font-medium">Last Restore Result</div>
            <div className="text-sm text-muted-foreground">
              Backup: {lastRestoreResult.backupName || lastRestoreResult.backupId || "-"}
              {lastRestoreResult.restoredAt
                ? ` | Restored at ${formatDateTimeDDMMYYYY(lastRestoreResult.restoredAt, { includeSeconds: true })}`
                : ""}
              {typeof lastRestoreResult.durationMs === "number"
                ? ` | Duration ${(lastRestoreResult.durationMs / 1000).toFixed(1)}s`
                : ""}
            </div>
            <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div>Imports: +{lastRestoreResult.stats.imports.inserted} inserted, {lastRestoreResult.stats.imports.reactivated} reactivated</div>
              <div>Data rows: +{lastRestoreResult.stats.dataRows.inserted} inserted</div>
              <div>Users: +{lastRestoreResult.stats.users.inserted} inserted</div>
              <div>Audit logs: +{lastRestoreResult.stats.auditLogs.inserted} inserted</div>
              <div>Collection records: +{lastRestoreResult.stats.collectionRecords.inserted} inserted</div>
              <div>Collection receipts: +{lastRestoreResult.stats.collectionRecordReceipts.inserted} inserted</div>
            </div>
            <div className="text-sm text-muted-foreground">
              Processed: {lastRestoreResult.stats.totalProcessed} | Inserted: {lastRestoreResult.stats.totalInserted} | Reactivated: {lastRestoreResult.stats.totalReactivated} | Skipped: {lastRestoreResult.stats.totalSkipped}
            </div>
            {lastRestoreResult.stats.warnings.length > 0 ? (
              <div className="rounded-md border border-amber-300/40 bg-amber-50/40 p-3 text-sm">
                <div className="font-medium text-amber-800">Warnings ({lastRestoreResult.stats.warnings.length})</div>
                <ul className="mt-1 list-disc pl-5 text-amber-900">
                  {lastRestoreResult.stats.warnings.slice(0, 5).map((warning, index) => (
                    <li key={`${warning}-${index}`}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <BackupList
        backups={backups}
        backupsOpen={backupsOpen}
        canManageBackups={canManageBackups}
        deletingId={deletingId}
        filteredBackups={filteredAndSortedBackups}
        isLoading={isLoading}
        onBackupsOpenChange={setBackupsOpen}
        onClearFilters={clearAllFilters}
        onDeleteClick={setShowDeleteDialog}
        onRestoreClick={setShowRestoreDialog}
        restoringId={restoringId}
      />

      <BackupDialogs
        backupName={backupName}
        createPending={createBackupMutation.isPending}
        deletingId={deletingId}
        onBackupNameChange={setBackupName}
        onCloseCreateDialog={() => {
          setShowCreateDialog(false);
          setBackupName("");
        }}
        onConfirmCreate={handleCreateBackup}
        onConfirmDelete={handleDeleteBackup}
        onConfirmRestore={handleRestoreBackup}
        onDeleteDialogChange={setShowDeleteDialog}
        onRestoreDialogChange={setShowRestoreDialog}
        restoringId={restoringId}
        showCreateDialog={canManageBackups && showCreateDialog}
        showDeleteDialog={showDeleteDialog}
        showRestoreDialog={showRestoreDialog}
      />
    </div>
  );
}

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Database, Download, FileText, Loader2, Plus, RefreshCw } from "lucide-react";
import { AppPaginationBar } from "@/components/data/AppPaginationBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useMutationFeedback } from "@/hooks/useMutationFeedback";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { formatDateTimeDDMMYYYY } from "@/lib/date-format";
import {
  createBackupAsync,
  deleteBackup,
  getBackupJob,
  getBackups,
  restoreBackupAsync,
} from "@/lib/api";
import { BackupDialogs } from "@/pages/backup-restore/BackupDialogs";
import { BackupFiltersPanel } from "@/pages/backup-restore/BackupFiltersPanel";
import { BackupList } from "@/pages/backup-restore/BackupList";
import { resolveBackupMutationResponse } from "@/pages/backup-restore/backup-mutation-response";
import type {
  BackupRecord,
  BackupsResponse,
  BackupJobRecord,
  BackupRestoreProps,
  RestoreResponse,
} from "@/pages/backup-restore/types";
import {
  exportBackupsToCsv,
  exportBackupsToPdf,
  getBackupDateRange,
  normalizeBackup,
} from "@/pages/backup-restore/utils";
import { resolveBackupsExportBlockReason } from "@/pages/backup-restore/export-guards";

export default function BackupRestore({ userRole, embedded = false }: BackupRestoreProps) {
  const canManageBackups = userRole === "superuser";
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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [lastRestoreResult, setLastRestoreResult] = useState<RestoreResponse | null>(null);
  const [activeBackupJobId, setActiveBackupJobId] = useState<string | null>(null);
  const handledBackupJobIdRef = useRef<string | null>(null);
  const exportInFlightRef = useRef(false);
  const { toast } = useToast();
  const { notifyMutationError, notifyMutationSuccess } = useMutationFeedback();
  const deferredSearchName = useDeferredValue(searchName.trim());
  const dateRange = useMemo(
    () => getBackupDateRange(datePreset, dateFrom, dateTo),
    [datePreset, dateFrom, dateTo],
  );
  const backupQueryParams = useMemo(() => ({
    page,
    pageSize,
    searchName: deferredSearchName || undefined,
    createdBy: createdByFilter.trim() || undefined,
    dateFrom: dateRange.from ? dateRange.from.toISOString() : undefined,
    dateTo: dateRange.to ? dateRange.to.toISOString() : undefined,
    sortBy,
  }), [page, pageSize, deferredSearchName, createdByFilter, dateRange.from, dateRange.to, sortBy]);

  const { data, error, isLoading, isRefetching, refetch } = useQuery<BackupsResponse>({
    queryKey: ["/api/backups", backupQueryParams],
    queryFn: async () => {
      const response = await getBackups(backupQueryParams);
      const list = Array.isArray(response?.backups) ? response.backups : [];
      const normalizedBackups = list.map(normalizeBackup);
      const total = Math.max(0, Number(response?.pagination?.total || normalizedBackups.length));
      const totalPages = Math.max(1, Number(response?.pagination?.totalPages || Math.ceil(total / pageSize) || 1));
      return {
        backups: normalizedBackups,
        pagination: {
          page: Math.max(1, Number(response?.pagination?.page || page)),
          pageSize: Math.max(1, Number(response?.pagination?.pageSize || pageSize)),
          total,
          totalPages,
        },
      };
    },
    retry: 1,
  });

  const { data: activeBackupJob } = useQuery<BackupJobRecord>({
    queryKey: ["/api/backups/jobs", activeBackupJobId],
    enabled: Boolean(activeBackupJobId),
    queryFn: async () => getBackupJob(String(activeBackupJobId)),
    refetchInterval: (query) => {
      if (!activeBackupJobId) {
        return false;
      }
      const status = query.state.data?.status;
      return status === "completed" || status === "failed" ? false : 2000;
    },
  });

  const backups = data?.backups || [];
  const pagination = data?.pagination || {
    page,
    pageSize,
    total: backups.length,
    totalPages: Math.max(1, Math.ceil(backups.length / pageSize)),
  };

  const clearAllFilters = useCallback(() => {
    setSearchName("");
    setCreatedByFilter("");
    setSortBy("newest");
    setDatePreset("all");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }, []);

  const createBackupMutation = useMutation({
    mutationFn: async (name: string) =>
      resolveBackupMutationResponse(
        await createBackupAsync(name),
        "Backup creation queued.",
      ),
    onSuccess: async (result) => {
      handledBackupJobIdRef.current = null;
      setShowCreateDialog(false);
      setBackupName("");

      if (result.mode === "queued") {
        setActiveBackupJobId(result.job.id);
        notifyMutationSuccess({
          title: "Backup Queued",
          description: "Backup creation is running in the background.",
        });
        return;
      }

      clearAllFilters();
      setPage(1);
      notifyMutationSuccess({
        title: "Success",
        description: result.message || "Backup has been successfully created.",
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/backups"] }),
        refetch(),
      ]);
    },
    onError: (error) => {
      console.error("Failed to create backup:", error);
      notifyMutationError({
        title: "Backup Failed",
        error,
        fallbackDescription: "Failed to create backup.",
      });
    },
  });

  const restoreBackupMutation = useMutation({
    mutationFn: async (backupId: string) =>
      resolveBackupMutationResponse(
        await restoreBackupAsync(backupId),
        "Backup restore queued.",
      ),
    onSuccess: async (result) => {
      handledBackupJobIdRef.current = null;
      setShowRestoreDialog(null);

      if (result.mode === "queued") {
        setActiveBackupJobId(result.job.id);
        notifyMutationSuccess({
          title: "Restore Queued",
          description: "Backup restore is running in the background.",
          duration: 8000,
        });
        return;
      }

      if (result.restoreResult) {
        notifyRestoreSuccess(result.restoreResult);
      } else {
        notifyMutationSuccess({
          title: "Restore Complete",
          description: result.message || "Backup restore has completed.",
          duration: 8000,
        });
      }
      setRestoringId(null);
      await queryClient.invalidateQueries({ queryKey: ["/api/backups"] });
    },
    onError: (error) => {
      console.error("Failed to restore backup:", error);
      notifyMutationError({
        title: "Restore Failed",
        error,
        fallbackDescription: "Failed to restore backup.",
      });
      setRestoringId(null);
    },
  });

  const notifyRestoreSuccess = useCallback((result: RestoreResponse) => {
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

      notifyMutationSuccess({
        title: totalRestored > 0 ? "Restore Successful" : "Restore Complete",
        description: `${summary}${duration}`,
        duration: 8000,
      });
      setLastRestoreResult(result);
  }, [notifyMutationSuccess]);

  const deleteBackupMutation = useMutation({
    mutationFn: (backupId: string) => deleteBackup(backupId),
    onSuccess: async () => {
      notifyMutationSuccess({
        title: "Success",
        description: "Backup has been successfully deleted.",
      });
      setShowDeleteDialog(null);
      setDeletingId(null);
      await queryClient.invalidateQueries({ queryKey: ["/api/backups"] });
    },
    onError: (error) => {
      console.error("Failed to delete backup:", error);
      notifyMutationError({
        title: "Delete Failed",
        error,
        fallbackDescription: "Failed to delete backup.",
      });
      setDeletingId(null);
    },
  });
  const visibleBackups = backups;
  const activeBackupJobBusy =
    Boolean(activeBackupJobId)
    && (!activeBackupJob || activeBackupJob.status === "queued" || activeBackupJob.status === "running");

  const hasActiveFilters =
    Boolean(searchName) ||
    Boolean(createdByFilter) ||
    sortBy !== "newest" ||
    datePreset !== "all";

  useEffect(() => {
    if (page > pagination.totalPages) {
      setPage(pagination.totalPages);
    }
  }, [page, pagination.totalPages]);

  useEffect(() => {
    if (!activeBackupJob || !activeBackupJobId) {
      return;
    }
    if (activeBackupJob.status !== "completed" && activeBackupJob.status !== "failed") {
      return;
    }
    if (handledBackupJobIdRef.current === activeBackupJob.id) {
      return;
    }

    handledBackupJobIdRef.current = activeBackupJob.id;
    let cancelled = false;

    const finalizeBackupJob = async () => {
      if (activeBackupJob.status === "completed") {
        if (activeBackupJob.type === "create") {
          notifyMutationSuccess({
            title: "Success",
            description: "Backup has been successfully created.",
          });
          clearAllFilters();
          setPage(1);
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["/api/backups"] }),
            refetch(),
          ]);
        } else {
          const restoreResult = activeBackupJob.result as RestoreResponse | null;
          if (restoreResult) {
            notifyRestoreSuccess(restoreResult);
          } else {
            notifyMutationSuccess({
              title: "Restore Complete",
              description: "Backup restore has completed.",
              duration: 8000,
            });
          }
          await queryClient.invalidateQueries({ queryKey: ["/api/backups"] });
        }
      } else {
        notifyMutationError({
          title: activeBackupJob.type === "restore" ? "Restore Failed" : "Backup Failed",
          description: activeBackupJob.error?.message || "Background backup job failed.",
          duration: 8000,
        });
      }

      if (cancelled) {
        return;
      }
      setRestoringId(null);
      setActiveBackupJobId(null);
    };

    void finalizeBackupJob();
    return () => {
      cancelled = true;
    };
  }, [activeBackupJob, activeBackupJobId, clearAllFilters, notifyMutationError, notifyMutationSuccess, notifyRestoreSuccess, refetch]);

  const loading = isLoading || isRefetching;

  const handleCreateBackup = () => {
    if (!backupName.trim()) {
      notifyMutationError({
        title: "Backup Name Required",
        description: "Please enter a backup name.",
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
    const blockReason = resolveBackupsExportBlockReason({
      backupsLength: visibleBackups.length,
      exportingPdf,
    });
    if (blockReason === "busy" || exportInFlightRef.current) {
      return;
    }
    if (blockReason === "no_data") {
      return;
    }

    exportInFlightRef.current = true;
    setExportingPdf(true);
    try {
      await exportBackupsToPdf(visibleBackups);
    } catch (error: unknown) {
      console.error("Failed to export PDF:", error);
      notifyMutationError({
        title: "Export Failed",
        error,
        fallbackDescription: error instanceof Error ? error.message : "Failed to export PDF",
      });
    } finally {
      exportInFlightRef.current = false;
      setExportingPdf(false);
    }
  };

  return (
    <div className={embedded ? "space-y-6" : "space-y-6 p-6"}>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {embedded ? (
          <div>
            <p className="text-sm text-muted-foreground">
              Create data backups, restore previous snapshots, and export the current backup register.
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Database className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className={`${embedded ? "text-xl" : "text-2xl"} font-bold`} data-testid="text-backup-title">
                Backup & Restore
              </h1>
              <p className="text-sm text-muted-foreground">
                Create data backups and restore from existing backups
              </p>
            </div>
          </div>
        )}

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                className="w-full sm:w-auto"
                variant="outline"
                disabled={loading || visibleBackups.length === 0 || exportingPdf}
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
                  onClick={() => exportBackupsToCsv(visibleBackups)}
                  disabled={exportingPdf}
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
            className="w-full sm:w-auto"
            variant="outline"
            onClick={() => {
              void refetch();
            }}
            disabled={loading || activeBackupJobBusy}
            data-testid="button-refresh-backups"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {canManageBackups ? (
            <Button
              className="w-full sm:w-auto"
              onClick={() => setShowCreateDialog(true)}
              disabled={activeBackupJobBusy}
              data-testid="button-create-backup"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Backup
            </Button>
          ) : null}
        </div>
      </div>

      {activeBackupJobBusy && activeBackupJob ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="text-sm font-medium">
                {activeBackupJob.type === "restore" ? "Restore job in progress" : "Backup job in progress"}
              </div>
              <div className="text-sm text-muted-foreground">
                Status: {activeBackupJob.status}
                {activeBackupJob.queuePosition > 0
                  ? ` | Queue position ${activeBackupJob.queuePosition}`
                  : ""}
                {activeBackupJob.backupName
                  ? ` | ${activeBackupJob.backupName}`
                  : activeBackupJob.backupId
                    ? ` | ${activeBackupJob.backupId}`
                    : ""}
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-primary">
              <Loader2 className="h-4 w-4 animate-spin" />
              Running in background
            </div>
          </CardContent>
        </Card>
      ) : null}

      <BackupFiltersPanel
        createdByFilter={createdByFilter}
        dateFrom={dateFrom}
        datePreset={datePreset}
        dateTo={dateTo}
        filtersOpen={filtersOpen}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearAllFilters}
        onCreatedByFilterChange={(value) => {
          setCreatedByFilter(value);
          setPage(1);
        }}
        onDateFromChange={(value) => {
          setDateFrom(value);
          setPage(1);
        }}
        onDatePresetChange={(value) => {
          setDatePreset(value);
          if (value !== "custom") {
            setDateFrom("");
            setDateTo("");
          }
          setPage(1);
        }}
        onDateToChange={(value) => {
          setDateTo(value);
          setPage(1);
        }}
        onFiltersOpenChange={setFiltersOpen}
        onSearchNameChange={(value) => {
          setSearchName(value);
          setPage(1);
        }}
        onSortByChange={(value) => {
          setSortBy(value);
          setPage(1);
        }}
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
        backupsOpen={backupsOpen}
        backupJobBusy={activeBackupJobBusy}
        canManageBackups={canManageBackups}
        deletingId={deletingId}
        filteredBackups={visibleBackups}
        isLoading={isLoading}
        onBackupsOpenChange={setBackupsOpen}
        onClearFilters={clearAllFilters}
        onDeleteClick={setShowDeleteDialog}
        onRestoreClick={setShowRestoreDialog}
        restoringId={restoringId}
        totalBackups={pagination.total}
      />

      <AppPaginationBar
        disabled={loading}
        page={pagination.page}
        totalPages={pagination.totalPages}
        pageSize={pagination.pageSize}
        totalItems={pagination.total}
        itemLabel="backups"
        onPageChange={setPage}
        onPageSizeChange={(nextPageSize) => {
          setPageSize(nextPageSize);
          setPage(1);
        }}
      />

      <BackupDialogs
        backupName={backupName}
        backupJobBusy={activeBackupJobBusy}
        createPending={createBackupMutation.isPending || activeBackupJobBusy}
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

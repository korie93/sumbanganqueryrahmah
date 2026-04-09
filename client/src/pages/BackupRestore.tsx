import { Suspense, lazy } from "react";
import { AppQueryProvider } from "@/app/AppQueryProvider";
import { AppPaginationBar } from "@/components/data/AppPaginationBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BackupFiltersPanel } from "@/pages/backup-restore/BackupFiltersPanel";
import { BackupList } from "@/pages/backup-restore/BackupList";
import { BackupRestoreHeader } from "@/pages/backup-restore/BackupRestoreHeader";
import type { BackupRestoreProps } from "@/pages/backup-restore/types";
import { useBackupExportState } from "@/pages/backup-restore/useBackupExportState";
import { useBackupListState } from "@/pages/backup-restore/useBackupListState";
import { useBackupMutationState } from "@/pages/backup-restore/useBackupMutationState";

const LazyBackupActiveJobCard = lazy(() =>
  import("@/pages/backup-restore/BackupActiveJobCard").then((module) => ({
    default: module.BackupActiveJobCard,
  })),
);

const LazyBackupRestoreResultCard = lazy(() =>
  import("@/pages/backup-restore/BackupRestoreResultCard").then((module) => ({
    default: module.BackupRestoreResultCard,
  })),
);

const LazyBackupDialogs = lazy(() =>
  import("@/pages/backup-restore/BackupDialogs").then((module) => ({
    default: module.BackupDialogs,
  })),
);

function BackupCardFallback({ label }: { label: string }) {
  return (
    <Card className="border-border/60 bg-card/60">
      <CardContent className="pt-6 text-sm text-muted-foreground">{label}</CardContent>
    </Card>
  );
}

function BackupRestoreContent({ userRole, embedded = false }: BackupRestoreProps) {
  const canManageBackups = userRole === "superuser";
  const listState = useBackupListState();
  const visibleBackups = listState.backups;
  const mutationState = useBackupMutationState({
    clearAllFilters: listState.clearAllFilters,
    refetchBackups: async () => {
      await listState.refetch();
    },
  });
  const exportState = useBackupExportState(visibleBackups);

  const hasActiveBackupJobCard =
    mutationState.activeBackupJobBusy && Boolean(mutationState.activeBackupJob);
  const hasRestoreResultCard = Boolean(mutationState.lastRestoreResult);
  const hasBackupDialogs =
    mutationState.showCreateDialog
    || Boolean(mutationState.showRestoreDialog)
    || Boolean(mutationState.showDeleteDialog);

  return (
    <div className={embedded ? "space-y-6" : "space-y-6 p-6"}>
      <BackupRestoreHeader
        activeBackupJobBusy={mutationState.activeBackupJobBusy}
        canManageBackups={canManageBackups}
        embedded={embedded}
        exportingPdf={exportState.exportingPdf}
        loading={listState.loading}
        visibleBackupsLength={visibleBackups.length}
        onCreateBackupClick={() => mutationState.setShowCreateDialog(true)}
        onExportCsv={() => void exportState.handleExportCsv()}
        onExportPdf={() => void exportState.handleExportPdf()}
        onRefresh={() => {
          void listState.refetch();
        }}
      />

      {hasActiveBackupJobCard ? (
        <Suspense fallback={<BackupCardFallback label="Loading backup job status..." />}>
          <LazyBackupActiveJobCard
            activeBackupJob={mutationState.activeBackupJob}
            activeBackupJobBusy={mutationState.activeBackupJobBusy}
          />
        </Suspense>
      ) : null}

      <BackupFiltersPanel
        createdByFilter={listState.createdByFilter}
        dateFrom={listState.dateFrom}
        datePreset={listState.datePreset}
        dateTo={listState.dateTo}
        filtersOpen={listState.filtersOpen}
        hasActiveFilters={listState.hasActiveFilters}
        onClearFilters={listState.clearAllFilters}
        onCreatedByFilterChange={listState.updateCreatedByFilter}
        onDateFromChange={listState.updateDateFrom}
        onDatePresetChange={listState.updateDatePreset}
        onDateToChange={listState.updateDateTo}
        onFiltersOpenChange={listState.setFiltersOpen}
        onSearchNameChange={listState.updateSearchName}
        onSortByChange={listState.updateSortBy}
        searchName={listState.searchName}
        sortBy={listState.sortBy}
      />

      {listState.error ? (
        <Card className="border-destructive/40">
          <CardContent className="pt-6 flex items-center justify-between gap-3">
            <div className="text-sm text-destructive">
              Failed to load backup list. {listState.error instanceof Error ? listState.error.message : ""}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void listState.refetch();
              }}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {hasRestoreResultCard ? (
        <Suspense fallback={<BackupCardFallback label="Loading last restore result..." />}>
          <LazyBackupRestoreResultCard lastRestoreResult={mutationState.lastRestoreResult} />
        </Suspense>
      ) : null}

      <BackupList
        backupsOpen={listState.backupsOpen}
        backupJobBusy={mutationState.activeBackupJobBusy}
        canManageBackups={canManageBackups}
        deletingId={mutationState.deletingId}
        filteredBackups={visibleBackups}
        isLoading={listState.loading}
        onBackupsOpenChange={listState.setBackupsOpen}
        onClearFilters={listState.clearAllFilters}
        onDeleteClick={mutationState.setShowDeleteDialog}
        onRestoreClick={mutationState.setShowRestoreDialog}
        restoringId={mutationState.restoringId}
        totalBackups={listState.pagination.total}
      />

      <AppPaginationBar
        disabled={listState.loading}
        loading={listState.loading}
        page={listState.pagination.page}
        totalPages={listState.pagination.totalPages}
        pageSize={listState.pagination.pageSize}
        totalItems={listState.pagination.total}
        itemLabel="backups"
        onPageChange={listState.setPage}
        onPageSizeChange={listState.updatePageSize}
      />

      {hasBackupDialogs ? (
        <Suspense fallback={null}>
          <LazyBackupDialogs
            backupName={mutationState.backupName}
            backupJobBusy={mutationState.activeBackupJobBusy}
            createPending={mutationState.createPending}
            deletingId={mutationState.deletingId}
            onBackupNameChange={mutationState.setBackupName}
            onCloseCreateDialog={mutationState.closeCreateDialog}
            onConfirmCreate={mutationState.handleCreateBackup}
            onConfirmDelete={mutationState.handleDeleteBackup}
            onConfirmRestore={mutationState.handleRestoreBackup}
            onDeleteDialogChange={mutationState.setShowDeleteDialog}
            onRestoreDialogChange={mutationState.setShowRestoreDialog}
            restoringId={mutationState.restoringId}
            showCreateDialog={canManageBackups && mutationState.showCreateDialog}
            showDeleteDialog={mutationState.showDeleteDialog}
            showRestoreDialog={mutationState.showRestoreDialog}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

export default function BackupRestore(props: BackupRestoreProps) {
  return (
    <AppQueryProvider>
      <BackupRestoreContent {...props} />
    </AppQueryProvider>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, type QueryKey } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import {
  createBackupAsync,
  deleteBackup,
  restoreBackupAsync,
} from "@/lib/api";
import { logClientError } from "@/lib/client-logger";
import { useMutationFeedback } from "@/hooks/useMutationFeedback";
import type {
  BackupRecord,
  BackupsResponse,
  RestoreResponse,
} from "@/pages/backup-restore/types";
import { removeBackupFromBackupsResponse } from "@/pages/backup-restore/backup-optimistic-updates";
import { resolveBackupMutationResponse } from "@/pages/backup-restore/backup-mutation-response";
import { useBackupJobRecovery } from "@/pages/backup-restore/useBackupJobRecovery";
import {
  buildRestoreSuccessSummary,
  isBackupJobInProgress,
  isBackupJobTerminal,
} from "@/pages/backup-restore/backup-state-utils";

type BackupMutationStateOptions = {
  clearAllFilters: () => void;
  refetchBackups: () => Promise<unknown>;
};

type DeleteBackupMutationContext = {
  previousBackupQueries: Array<[QueryKey, BackupsResponse | undefined]>;
  isCurrentSession: () => boolean;
};

export function useBackupMutationState({
  clearAllFilters,
  refetchBackups,
}: BackupMutationStateOptions) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showRestoreDialog, setShowRestoreDialog] = useState<BackupRecord | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState<BackupRecord | null>(null);
  const [backupName, setBackupName] = useState("");
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [lastRestoreResult, setLastRestoreResult] = useState<RestoreResponse | null>(null);
  const {
    activeBackupJob, activeBackupJobId, backupJobState, backupJobError,
    backupJobChecking, backupJobHandled, isCurrentSession, markBackupJobHandled,
    retryBackupJob, trackBackupJob,
  } = useBackupJobRecovery();

  const handledBackupJobIdRef = useRef<string | null>(null);
  const { notifyMutationError, notifyMutationSuccess } = useMutationFeedback();

  const notifyRestoreSuccess = useCallback(
    (result: RestoreResponse) => {
      const summary = buildRestoreSuccessSummary(result);
      notifyMutationSuccess({
        title: summary.title,
        description: summary.description,
        duration: 8000,
      });
      setLastRestoreResult(result);
    },
    [notifyMutationSuccess],
  );

  const createBackupMutation = useMutation({
    onMutate: () => ({ isCurrentSession }),
    mutationFn: async (name: string) =>
      resolveBackupMutationResponse(await createBackupAsync(name), "Backup creation queued."),
    onSuccess: async (result, _name, context) => {
      if (!context?.isCurrentSession()) return;
      handledBackupJobIdRef.current = null;
      setShowCreateDialog(false);
      setBackupName("");

      if (result.mode === "queued") {
        trackBackupJob(result.job.id);
        notifyMutationSuccess({
          title: "Backup Queued",
          description: "Backup creation is running in the background.",
        });
        return;
      }

      clearAllFilters();
      notifyMutationSuccess({
        title: "Success",
        description: result.message || "Backup has been successfully created.",
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/backups"] }),
        refetchBackups(),
      ]);
    },
    onError: (error, _name, context) => {
      if (!context?.isCurrentSession()) return;
      logClientError("Failed to create backup:", error);
      notifyMutationError({
        title: "Backup Failed",
        error,
        fallbackDescription: "Failed to create backup.",
      });
    },
  });

  const restoreBackupMutation = useMutation({
    onMutate: () => ({ isCurrentSession }),
    mutationFn: async (backupId: string) =>
      resolveBackupMutationResponse(await restoreBackupAsync(backupId), "Backup restore queued."),
    onSuccess: async (result, _backupId, context) => {
      if (!context?.isCurrentSession()) return;
      handledBackupJobIdRef.current = null;
      setShowRestoreDialog(null);

      if (result.mode === "queued") {
        trackBackupJob(result.job.id);
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
    onError: (error, _backupId, context) => {
      if (!context?.isCurrentSession()) return;
      logClientError("Failed to restore backup:", error);
      notifyMutationError({
        title: "Restore Failed",
        error,
        fallbackDescription: "Failed to restore backup.",
      });
      setRestoringId(null);
    },
  });

  const deleteBackupMutation = useMutation<unknown, Error, string, DeleteBackupMutationContext>({
    mutationFn: (backupId: string) => deleteBackup(backupId),
    onMutate: async (backupId) => {
      const sessionIsCurrent = isCurrentSession;
      await queryClient.cancelQueries({ queryKey: ["/api/backups"] });
      if (!sessionIsCurrent()) return { previousBackupQueries: [], isCurrentSession: sessionIsCurrent };
      const previousBackupQueries = queryClient.getQueriesData<BackupsResponse>({
        queryKey: ["/api/backups"],
      });

      queryClient.setQueriesData<BackupsResponse>({ queryKey: ["/api/backups"] }, (previous) =>
        removeBackupFromBackupsResponse(previous, backupId),
      );

      return { previousBackupQueries, isCurrentSession: sessionIsCurrent };
    },
    onSuccess: (_result, _backupId, context) => {
      if (!context?.isCurrentSession()) return;
      notifyMutationSuccess({
        title: "Success",
        description: "Backup has been successfully deleted.",
      });
      setShowDeleteDialog(null);
      setDeletingId(null);
    },
    onError: (error, backupId, context) => {
      if (!context?.isCurrentSession()) return;
      for (const [queryKey, previousData] of context?.previousBackupQueries ?? []) {
        queryClient.setQueryData(queryKey, previousData);
      }

      logClientError("Failed to delete backup:", error, { backupId });
      notifyMutationError({
        title: "Delete Failed",
        error,
        fallbackDescription: "Failed to delete backup.",
      });
      setDeletingId(null);
    },
    onSettled: async (_result, _error, _backupId, context) => {
      if (!context?.isCurrentSession()) return;
      await queryClient.invalidateQueries({ queryKey: ["/api/backups"] });
    },
  });

  useEffect(() => {
    if (!isCurrentSession() || backupJobHandled || !activeBackupJob || !activeBackupJobId || !isBackupJobTerminal(activeBackupJob.status)) {
      return;
    }
    if (handledBackupJobIdRef.current === activeBackupJob.id) {
      return;
    }

    handledBackupJobIdRef.current = activeBackupJob.id;
    markBackupJobHandled(activeBackupJob.id);
    setRestoringId(null);

    const finalizeBackupJob = async () => {
      if (activeBackupJob.status === "completed") {
        if (activeBackupJob.type === "create") {
          notifyMutationSuccess({
            title: "Success",
            description: "Backup has been successfully created.",
          });
          clearAllFilters();
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["/api/backups"] }),
            refetchBackups(),
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

    };

    void finalizeBackupJob();
  }, [
    activeBackupJob,
    activeBackupJobId,
    backupJobHandled,
    clearAllFilters,
    notifyMutationError,
    notifyMutationSuccess,
    notifyRestoreSuccess,
    refetchBackups,
    isCurrentSession,
    markBackupJobHandled,
  ]);

  const activeBackupJobBusy = isBackupJobInProgress(activeBackupJob, activeBackupJobId);

  const handleCreateBackup = useCallback(() => {
    if (!backupName.trim()) {
      notifyMutationError({
        title: "Backup Name Required",
        description: "Please enter a backup name.",
      });
      return;
    }

    createBackupMutation.mutate(backupName.trim());
  }, [backupName, createBackupMutation, notifyMutationError]);

  const handleRestoreBackup = useCallback((backup: BackupRecord) => {
    setRestoringId(backup.id);
    restoreBackupMutation.mutate(backup.id);
  }, [restoreBackupMutation]);

  const handleDeleteBackup = useCallback((backup: BackupRecord) => {
    setDeletingId(backup.id);
    deleteBackupMutation.mutate(backup.id);
  }, [deleteBackupMutation]);

  const closeCreateDialog = useCallback(() => {
    setShowCreateDialog(false);
    setBackupName("");
  }, []);

  return {
    showCreateDialog,
    showRestoreDialog,
    showDeleteDialog,
    backupName,
    restoringId,
    deletingId,
    lastRestoreResult,
    activeBackupJob,
    activeBackupJobBusy,
    backupJobState,
    backupJobError,
    backupJobChecking,
    retryBackupJob,
    setShowCreateDialog,
    setShowRestoreDialog,
    setShowDeleteDialog,
    setBackupName,
    closeCreateDialog,
    handleCreateBackup,
    handleRestoreBackup,
    handleDeleteBackup,
    createPending: createBackupMutation.isPending || activeBackupJobBusy,
  };
}

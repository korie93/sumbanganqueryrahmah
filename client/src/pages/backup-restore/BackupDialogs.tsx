import { BackupConfirmDialog } from "@/pages/backup-restore/BackupConfirmDialog";
import { BackupCreateDialog } from "@/pages/backup-restore/BackupCreateDialog";
import type { BackupRecord } from "@/pages/backup-restore/types";

interface BackupDialogsProps {
  backupName: string;
  backupJobBusy: boolean;
  createPending: boolean;
  deletingId: string | null;
  onBackupNameChange: (value: string) => void;
  onCloseCreateDialog: () => void;
  onConfirmCreate: () => void;
  onConfirmDelete: (backup: BackupRecord) => void;
  onConfirmRestore: (backup: BackupRecord) => void;
  onDeleteDialogChange: (backup: BackupRecord | null) => void;
  onRestoreDialogChange: (backup: BackupRecord | null) => void;
  restoringId: string | null;
  showCreateDialog: boolean;
  showDeleteDialog: BackupRecord | null;
  showRestoreDialog: BackupRecord | null;
}

export function BackupDialogs({
  backupName,
  backupJobBusy,
  createPending,
  deletingId,
  onBackupNameChange,
  onCloseCreateDialog,
  onConfirmCreate,
  onConfirmDelete,
  onConfirmRestore,
  onDeleteDialogChange,
  onRestoreDialogChange,
  restoringId,
  showCreateDialog,
  showDeleteDialog,
  showRestoreDialog,
}: BackupDialogsProps) {
  return (
    <>
      <BackupCreateDialog
        backupJobBusy={backupJobBusy}
        backupName={backupName}
        createPending={createPending}
        onBackupNameChange={onBackupNameChange}
        onCloseCreateDialog={onCloseCreateDialog}
        onConfirmCreate={onConfirmCreate}
        showCreateDialog={showCreateDialog}
      />

      <BackupConfirmDialog
        cancelTestId="button-cancel-restore"
        confirmLabel="Restore"
        confirmTestId="button-confirm-restore"
        description={`You will restore data from backup "${showRestoreDialog?.name}". Existing data will not be overwritten, only new data will be added.`}
        isPending={backupJobBusy || restoringId === showRestoreDialog?.id}
        onConfirm={onConfirmRestore}
        onOpenChange={() => onRestoreDialogChange(null)}
        openBackup={showRestoreDialog}
        title="Restore Backup?"
      />

      <BackupConfirmDialog
        cancelTestId="button-cancel-delete"
        confirmClassName="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        confirmLabel="Delete"
        confirmTestId="button-confirm-delete"
        description={`Are you sure you want to delete backup "${showDeleteDialog?.name}"? This action cannot be undone.`}
        isPending={backupJobBusy || deletingId === showDeleteDialog?.id}
        onConfirm={onConfirmDelete}
        onOpenChange={() => onDeleteDialogChange(null)}
        openBackup={showDeleteDialog}
        title="Delete Backup?"
      />
    </>
  );
}

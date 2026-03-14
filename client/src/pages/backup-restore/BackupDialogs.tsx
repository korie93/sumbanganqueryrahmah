import { Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BackupRecord } from "@/pages/backup-restore/types";

interface BackupDialogsProps {
  backupName: string;
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
      <Dialog open={showCreateDialog} onOpenChange={(open) => (open ? undefined : onCloseCreateDialog())}>
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
                onChange={(event) => onBackupNameChange(event.target.value)}
                data-testid="input-backup-name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onCloseCreateDialog} data-testid="button-cancel-create">
              Cancel
            </Button>
            <Button
              onClick={onConfirmCreate}
              disabled={createPending || !backupName.trim()}
              data-testid="button-confirm-create"
            >
              {createPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Create Backup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!showRestoreDialog} onOpenChange={() => onRestoreDialogChange(null)}>
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
              onClick={() => {
                if (showRestoreDialog) {
                  onConfirmRestore(showRestoreDialog);
                }
              }}
              disabled={restoringId === showRestoreDialog?.id}
              data-testid="button-confirm-restore"
            >
              {restoringId === showRestoreDialog?.id ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : null}
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!showDeleteDialog} onOpenChange={() => onDeleteDialogChange(null)}>
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
              onClick={() => {
                if (showDeleteDialog) {
                  onConfirmDelete(showDeleteDialog);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deletingId === showDeleteDialog?.id}
              data-testid="button-confirm-delete"
            >
              {deletingId === showDeleteDialog?.id ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

import { Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
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

interface BackupCreateDialogProps {
  backupJobBusy: boolean;
  backupName: string;
  createPending: boolean;
  onBackupNameChange: (value: string) => void;
  onCloseCreateDialog: () => void;
  onConfirmCreate: () => void;
  showCreateDialog: boolean;
}

export function BackupCreateDialog({
  backupJobBusy,
  backupName,
  createPending,
  onBackupNameChange,
  onCloseCreateDialog,
  onConfirmCreate,
  showCreateDialog,
}: BackupCreateDialogProps) {
  return (
    <Dialog open={showCreateDialog} onOpenChange={(open) => (open ? undefined : onCloseCreateDialog())}>
      <DialogContent className="sm:max-w-[34rem]">
        <DialogHeader>
          <DialogTitle>Create New Backup</DialogTitle>
          <DialogDescription>
            The backup will save imports, data rows, users, audit logs, and collection records.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="rounded-2xl border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
            Use a clear name so restore history stays easy to scan later, for example the date,
            branch, or the reason this snapshot is being created.
          </div>
          <div className="space-y-2">
            <Label htmlFor="backup-name">Backup Name</Label>
            <Input
              id="backup-name"
              name="backupName"
              placeholder="Example: Daily Backup 07-12-2025"
              value={backupName}
              onChange={(event) => onBackupNameChange(event.target.value)}
              autoComplete="off"
              data-testid="input-backup-name"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={onCloseCreateDialog} data-testid="button-cancel-create">
            Cancel
          </Button>
          <Button
            onClick={onConfirmCreate}
            disabled={backupJobBusy || createPending || !backupName.trim()}
            className="rounded-xl"
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
  );
}

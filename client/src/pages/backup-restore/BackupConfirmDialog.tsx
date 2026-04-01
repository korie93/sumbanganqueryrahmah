import { RefreshCw } from "lucide-react";
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
import type { BackupRecord } from "@/pages/backup-restore/types";

interface BackupConfirmDialogProps {
  cancelTestId: string;
  confirmClassName?: string;
  confirmLabel: string;
  confirmTestId: string;
  description: string;
  isPending: boolean;
  onConfirm: (backup: BackupRecord) => void;
  onOpenChange: () => void;
  openBackup: BackupRecord | null;
  title: string;
}

export function BackupConfirmDialog({
  cancelTestId,
  confirmClassName,
  confirmLabel,
  confirmTestId,
  description,
  isPending,
  onConfirm,
  onOpenChange,
  openBackup,
  title,
}: BackupConfirmDialogProps) {
  return (
    <AlertDialog open={!!openBackup} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid={cancelTestId}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (openBackup) {
                onConfirm(openBackup);
              }
            }}
            className={confirmClassName}
            disabled={isPending}
            data-testid={confirmTestId}
          >
            {isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : null}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

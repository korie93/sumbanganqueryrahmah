import { Archive, Clock, Database, FileText, HardDrive, RotateCcw, Trash2, User, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { BackupRecord } from "@/pages/backup-restore/types";
import { formatBackupTime } from "@/pages/backup-restore/utils";

interface BackupListItemProps {
  backup: BackupRecord;
  backupJobBusy: boolean;
  canManageBackups: boolean;
  deletingId: string | null;
  onDeleteClick: (backup: BackupRecord) => void;
  onRestoreClick: (backup: BackupRecord) => void;
  restoringId: string | null;
}

export function BackupListItem({
  backup,
  backupJobBusy,
  canManageBackups,
  deletingId,
  onDeleteClick,
  onRestoreClick,
  restoringId,
}: BackupListItemProps) {
  return (
    <div
      className="space-y-3 rounded-xl border border-border/70 bg-card/70 p-4 shadow-sm"
      data-testid={`backup-item-${backup.id}`}
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Badge variant="secondary">{backup.name}</Badge>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <User className="h-4 w-4" />
            <span data-testid={`text-backup-created-by-${backup.id}`}>{backup.createdBy}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 text-sm text-foreground/80">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span data-testid={`text-backup-date-${backup.id}`}>{formatBackupTime(backup.createdAt)}</span>
        </div>
      </div>

      {backup.metadata ? (
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
          {backup.metadata.collectionRecordsCount ? (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Database className="h-4 w-4" />
              <span>{backup.metadata.collectionRecordsCount} collection records</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {canManageBackups ? (
        <div className="flex items-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onRestoreClick(backup)}
            disabled={backupJobBusy || restoringId === backup.id}
            data-testid={`button-restore-${backup.id}`}
          >
            <RotateCcw className={`h-4 w-4 mr-2 ${restoringId === backup.id ? "animate-spin" : ""}`} />
            Restore
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => onDeleteClick(backup)}
            disabled={backupJobBusy || deletingId === backup.id}
            data-testid={`button-delete-backup-${backup.id}`}
          >
            <Trash2 className={`h-4 w-4 mr-2 ${deletingId === backup.id ? "animate-spin" : ""}`} />
            Delete
          </Button>
        </div>
      ) : null}
    </div>
  );
}

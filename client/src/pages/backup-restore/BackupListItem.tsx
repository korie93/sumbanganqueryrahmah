import { Archive, Clock, Database, FileText, HardDrive, RotateCcw, Trash2, User, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { buildBackupRowAriaLabel } from "@/pages/backup-restore/backup-row-aria";
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
  const isMobile = useIsMobile();
  const formattedCreatedAt = formatBackupTime(backup.createdAt);

  return (
    <div
      aria-label={buildBackupRowAriaLabel({
        backup,
        formattedCreatedAt,
      })}
      className={`space-y-3 border border-border/70 bg-card/70 shadow-sm ${
        isMobile ? "rounded-2xl p-3.5" : "rounded-xl p-4"
      }`}
      data-testid={`backup-item-${backup.id}`}
      role="group"
    >
      <div className={`flex justify-between gap-4 flex-wrap ${isMobile ? "items-start" : "items-center"}`}>
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Badge variant="secondary" className="max-w-full">
              <span className="truncate">{backup.name}</span>
            </Badge>
            <div className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
              <User className="h-4 w-4 shrink-0" />
              <span className="truncate" data-testid={`text-backup-created-by-${backup.id}`}>{backup.createdBy}</span>
            </div>
          </div>
          {isMobile ? (
            <span className="text-xs text-muted-foreground" data-testid={`text-backup-date-${backup.id}`}>
              {formattedCreatedAt}
            </span>
          ) : null}
        </div>
        <div className={`items-center gap-1 text-sm text-foreground/80 ${isMobile ? "hidden" : "flex"}`}>
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span data-testid={`text-backup-date-${backup.id}`}>{formattedCreatedAt}</span>
        </div>
      </div>

      {backup.metadata ? (
        <div className={`flex flex-wrap ${isMobile ? "gap-2 text-xs" : "gap-4 text-sm"}`}>
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
        <div className={`pt-2 ${isMobile ? "grid grid-cols-2 gap-2" : "flex items-center gap-2"}`}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onRestoreClick(backup)}
            disabled={backupJobBusy || restoringId === backup.id}
            data-testid={`button-restore-${backup.id}`}
            className={isMobile ? "w-full" : undefined}
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
            className={isMobile ? "w-full" : undefined}
          >
            <Trash2 className={`h-4 w-4 mr-2 ${deletingId === backup.id ? "animate-spin" : ""}`} />
            Delete
          </Button>
        </div>
      ) : null}
    </div>
  );
}

import { Archive, ChevronDown, Clock, Database, FileText, HardDrive, RefreshCw, RotateCcw, Trash2, User, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { BackupRecord } from "@/pages/backup-restore/types";
import { formatBackupTime } from "@/pages/backup-restore/utils";

interface BackupListProps {
  backupsOpen: boolean;
  backupJobBusy: boolean;
  canManageBackups: boolean;
  deletingId: string | null;
  filteredBackups: BackupRecord[];
  isLoading: boolean;
  onBackupsOpenChange: (open: boolean) => void;
  onClearFilters: () => void;
  onDeleteClick: (backup: BackupRecord) => void;
  onRestoreClick: (backup: BackupRecord) => void;
  restoringId: string | null;
  totalBackups: number;
}

export function BackupList({
  backupsOpen,
  backupJobBusy,
  canManageBackups,
  deletingId,
  filteredBackups,
  isLoading,
  onBackupsOpenChange,
  onClearFilters,
  onDeleteClick,
  onRestoreClick,
  restoringId,
  totalBackups,
}: BackupListProps) {
  return (
    <Collapsible open={backupsOpen} onOpenChange={onBackupsOpenChange}>
      <Card>
        <CardHeader className="pb-3">
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="w-full flex items-center justify-between gap-2 p-0 h-auto"
              data-testid="button-toggle-backups"
            >
              <CardTitle className="text-lg flex items-center gap-2">
                <Archive className="h-5 w-5" />
                Backup List ({filteredBackups.length} of {totalBackups})
              </CardTitle>
              <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${backupsOpen ? "rotate-180" : ""}`} />
            </Button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredBackups.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                {totalBackups === 0 ? (
                  <>
                    <p>No backups found.</p>
                    <p className="text-sm mt-2">Click "Create Backup" to create a new backup.</p>
                  </>
                ) : (
                  <>
                    <p>No backups match the filters.</p>
                    <Button
                      variant="ghost"
                      onClick={onClearFilters}
                      className="mt-2"
                      data-testid="button-clear-backup-filters-empty"
                    >
                      Clear all filters
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <div className="max-h-[400px] overflow-y-auto pr-2 space-y-3">
                {filteredBackups.map((backup) => (
                  <div
                    key={backup.id}
                    className="p-4 rounded-lg border bg-muted/30 space-y-3"
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
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" />
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
                ))}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

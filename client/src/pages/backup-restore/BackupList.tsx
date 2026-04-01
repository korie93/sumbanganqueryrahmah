import { Archive, ChevronDown, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { BackupListEmptyState } from "@/pages/backup-restore/BackupListEmptyState";
import { BackupListItem } from "@/pages/backup-restore/BackupListItem";
import type { BackupRecord } from "@/pages/backup-restore/types";

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
              <BackupListEmptyState
                onClearFilters={onClearFilters}
                totalBackups={totalBackups}
              />
            ) : (
              <div className="max-h-[400px] overflow-y-auto pr-2 space-y-3">
                {filteredBackups.map((backup) => (
                  <BackupListItem
                    key={backup.id}
                    backup={backup}
                    backupJobBusy={backupJobBusy}
                    canManageBackups={canManageBackups}
                    deletingId={deletingId}
                    onDeleteClick={onDeleteClick}
                    onRestoreClick={onRestoreClick}
                    restoringId={restoringId}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

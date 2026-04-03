import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useIsMobile } from "@/hooks/use-mobile";
import type { BackupJobRecord } from "@/pages/backup-restore/types";

interface BackupActiveJobCardProps {
  activeBackupJob: BackupJobRecord | undefined;
  activeBackupJobBusy: boolean;
}

export function BackupActiveJobCard({
  activeBackupJob,
  activeBackupJobBusy,
}: BackupActiveJobCardProps) {
  const isMobile = useIsMobile();

  if (!activeBackupJobBusy || !activeBackupJob) {
    return null;
  }

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className={`flex flex-col gap-2 ${isMobile ? "pt-4" : "pt-6 sm:flex-row sm:items-center sm:justify-between"}`}>
        <div className="space-y-1">
          <div className="text-sm font-medium">
            {activeBackupJob.type === "restore" ? "Restore job in progress" : "Backup job in progress"}
          </div>
          {isMobile ? (
            <div className="flex flex-wrap gap-2 text-[11px]">
              <Badge variant="secondary" className="rounded-full px-2.5 py-1">
                Status {activeBackupJob.status}
              </Badge>
              {activeBackupJob.queuePosition > 0 ? (
                <Badge variant="outline" className="rounded-full px-2.5 py-1">
                  Queue {activeBackupJob.queuePosition}
                </Badge>
              ) : null}
              {activeBackupJob.backupName ? (
                <Badge variant="outline" className="max-w-full rounded-full px-2.5 py-1">
                  <span className="truncate">{activeBackupJob.backupName}</span>
                </Badge>
              ) : activeBackupJob.backupId ? (
                <Badge variant="outline" className="max-w-full rounded-full px-2.5 py-1">
                  <span className="truncate">{activeBackupJob.backupId}</span>
                </Badge>
              ) : null}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              Status: {activeBackupJob.status}
              {activeBackupJob.queuePosition > 0
                ? ` | Queue position ${activeBackupJob.queuePosition}`
                : ""}
              {activeBackupJob.backupName
                ? ` | ${activeBackupJob.backupName}`
                : activeBackupJob.backupId
                  ? ` | ${activeBackupJob.backupId}`
                  : ""}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-primary">
          <Loader2 className="h-4 w-4 animate-spin" />
          Running in background
        </div>
      </CardContent>
    </Card>
  );
}

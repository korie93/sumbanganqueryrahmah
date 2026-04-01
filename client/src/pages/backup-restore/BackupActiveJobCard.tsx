import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { BackupJobRecord } from "@/pages/backup-restore/types";

interface BackupActiveJobCardProps {
  activeBackupJob: BackupJobRecord | undefined;
  activeBackupJobBusy: boolean;
}

export function BackupActiveJobCard({
  activeBackupJob,
  activeBackupJobBusy,
}: BackupActiveJobCardProps) {
  if (!activeBackupJobBusy || !activeBackupJob) {
    return null;
  }

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="pt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="text-sm font-medium">
            {activeBackupJob.type === "restore" ? "Restore job in progress" : "Backup job in progress"}
          </div>
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
        </div>
        <div className="flex items-center gap-2 text-sm text-primary">
          <Loader2 className="h-4 w-4 animate-spin" />
          Running in background
        </div>
      </CardContent>
    </Card>
  );
}

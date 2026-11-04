import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import type { BackupJobRecord } from "@/pages/backup-restore/types";
import type { BackupJobDisplayState } from "./backup-job-recovery";

interface BackupActiveJobCardProps {
  activeBackupJob: BackupJobRecord | undefined;
  activeBackupJobBusy: boolean;
  backupJobState: BackupJobDisplayState;
  backupJobError: boolean;
  backupJobChecking: boolean;
  onRetry: () => void;
}

export function BackupActiveJobCard({
  activeBackupJob,
  activeBackupJobBusy,
  backupJobState,
  backupJobError,
  backupJobChecking,
  onRetry,
}: BackupActiveJobCardProps) {
  const isMobile = useIsMobile();

  if (!activeBackupJobBusy && !backupJobError) {
    return null;
  }

  if (backupJobError || backupJobState === "checking" || !activeBackupJob) {
    return (
      <Card className={backupJobError ? "border-destructive/40" : "border-border"}>
        <CardContent className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${isMobile ? "pt-4" : "pt-6"}`}>
          <div className="min-w-0 space-y-1" role={backupJobError ? "alert" : "status"} aria-live="polite">
            <p className="text-sm font-medium">
              {backupJobError ? "Could not check job status" : "Checking backup or restore job"}
            </p>
            <p className="text-sm text-muted-foreground">
              {backupJobError
                ? "The tracked job may still be running. Retry to check its current status."
                : "Reconnecting to the job tracked in this session."}
            </p>
          </div>
          {backupJobError ? (
            <Button variant="outline" onClick={onRetry} disabled={backupJobChecking} className="min-h-11 shrink-0 md:min-h-9">
              {backupJobChecking ? "Checking..." : "Retry job status"}
            </Button>
          ) : <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/25 bg-primary/5 shadow-[0_18px_34px_-30px_hsl(217_91%_50%_/_0.28)]">
      <CardContent className={`flex flex-col gap-2 ${isMobile ? "pt-4" : "pt-6 sm:flex-row sm:items-center sm:justify-between"}`}>
        <div className="space-y-1">
          <div className="text-sm font-medium">
            {activeBackupJob.status === "queued"
              ? activeBackupJob.type === "restore" ? "Restore job queued" : "Backup job queued"
              : activeBackupJob.type === "restore" ? "Restore job in progress" : "Backup job in progress"}
          </div>
          {isMobile ? (
            <div className="flex flex-wrap gap-2 text-2xs">
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
          {activeBackupJob.status === "queued" ? "Waiting in queue" : "Running in background"}
        </div>
      </CardContent>
    </Card>
  );
}

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatOperationalDateTime } from "@/lib/date-format";
import type { RestoreResponse } from "@/pages/backup-restore/types";

interface BackupRestoreResultCardProps {
  lastRestoreResult: RestoreResponse | null;
}

export function BackupRestoreResultCard({
  lastRestoreResult,
}: BackupRestoreResultCardProps) {
  const isMobile = useIsMobile();
  const warningOccurrences = new Map<string, number>();

  if (!lastRestoreResult) {
    return null;
  }

  return (
    <Card className="border-border/60">
      <CardContent className={`${isMobile ? "space-y-3 pt-4" : "space-y-3 pt-6"}`}>
        <div className="text-sm font-medium">Last Restore Result</div>
        {isMobile ? (
          <div className="flex flex-wrap gap-2 text-[11px]">
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              {lastRestoreResult.backupName || lastRestoreResult.backupId || "-"}
            </Badge>
            {lastRestoreResult.restoredAt ? (
              <Badge variant="outline" className="rounded-full px-3 py-1">
                {formatOperationalDateTime(lastRestoreResult.restoredAt)}
              </Badge>
            ) : null}
            {typeof lastRestoreResult.durationMs === "number" ? (
              <Badge variant="outline" className="rounded-full px-3 py-1">
                {(lastRestoreResult.durationMs / 1000).toFixed(1)}s
              </Badge>
            ) : null}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            Backup: {lastRestoreResult.backupName || lastRestoreResult.backupId || "-"}
            {lastRestoreResult.restoredAt
              ? ` | Restored at ${formatOperationalDateTime(lastRestoreResult.restoredAt)}`
              : ""}
            {typeof lastRestoreResult.durationMs === "number"
              ? ` | Duration ${(lastRestoreResult.durationMs / 1000).toFixed(1)}s`
              : ""}
          </div>
        )}
        <div className={`grid gap-2 text-sm ${isMobile ? "grid-cols-1" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
          <div>Imports: +{lastRestoreResult.stats.imports.inserted} inserted, {lastRestoreResult.stats.imports.reactivated} reactivated</div>
          <div>Data rows: +{lastRestoreResult.stats.dataRows.inserted} inserted</div>
          <div>Users: +{lastRestoreResult.stats.users.inserted} inserted</div>
          <div>Audit logs: +{lastRestoreResult.stats.auditLogs.inserted} inserted</div>
          <div>Collection records: +{lastRestoreResult.stats.collectionRecords.inserted} inserted</div>
          <div>Collection receipts: +{lastRestoreResult.stats.collectionRecordReceipts.inserted} inserted</div>
        </div>
        <div className={`${isMobile ? "text-xs" : "text-sm"} text-muted-foreground`}>
          Processed: {lastRestoreResult.stats.totalProcessed} | Inserted: {lastRestoreResult.stats.totalInserted} | Reactivated: {lastRestoreResult.stats.totalReactivated} | Skipped: {lastRestoreResult.stats.totalSkipped}
        </div>
        {lastRestoreResult.stats.warnings.length > 0 ? (
          <div className="rounded-md border border-amber-300/40 bg-amber-50/40 p-3 text-sm">
            <div className="font-medium text-amber-800">Warnings ({lastRestoreResult.stats.warnings.length})</div>
            <ul className="mt-1 list-disc pl-5 text-amber-900">
              {lastRestoreResult.stats.warnings.slice(0, 5).map((warning) => {
                const nextOccurrence = (warningOccurrences.get(warning) ?? 0) + 1;
                warningOccurrences.set(warning, nextOccurrence);
                return <li key={`${warning}::${nextOccurrence}`}>{warning}</li>;
              })}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

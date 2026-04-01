import { Card, CardContent } from "@/components/ui/card";
import { formatDateTimeDDMMYYYY } from "@/lib/date-format";
import type { RestoreResponse } from "@/pages/backup-restore/types";

interface BackupRestoreResultCardProps {
  lastRestoreResult: RestoreResponse | null;
}

export function BackupRestoreResultCard({
  lastRestoreResult,
}: BackupRestoreResultCardProps) {
  if (!lastRestoreResult) {
    return null;
  }

  return (
    <Card className="border-border/60">
      <CardContent className="pt-6 space-y-3">
        <div className="text-sm font-medium">Last Restore Result</div>
        <div className="text-sm text-muted-foreground">
          Backup: {lastRestoreResult.backupName || lastRestoreResult.backupId || "-"}
          {lastRestoreResult.restoredAt
            ? ` | Restored at ${formatDateTimeDDMMYYYY(lastRestoreResult.restoredAt, { includeSeconds: true })}`
            : ""}
          {typeof lastRestoreResult.durationMs === "number"
            ? ` | Duration ${(lastRestoreResult.durationMs / 1000).toFixed(1)}s`
            : ""}
        </div>
        <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>Imports: +{lastRestoreResult.stats.imports.inserted} inserted, {lastRestoreResult.stats.imports.reactivated} reactivated</div>
          <div>Data rows: +{lastRestoreResult.stats.dataRows.inserted} inserted</div>
          <div>Users: +{lastRestoreResult.stats.users.inserted} inserted</div>
          <div>Audit logs: +{lastRestoreResult.stats.auditLogs.inserted} inserted</div>
          <div>Collection records: +{lastRestoreResult.stats.collectionRecords.inserted} inserted</div>
          <div>Collection receipts: +{lastRestoreResult.stats.collectionRecordReceipts.inserted} inserted</div>
        </div>
        <div className="text-sm text-muted-foreground">
          Processed: {lastRestoreResult.stats.totalProcessed} | Inserted: {lastRestoreResult.stats.totalInserted} | Reactivated: {lastRestoreResult.stats.totalReactivated} | Skipped: {lastRestoreResult.stats.totalSkipped}
        </div>
        {lastRestoreResult.stats.warnings.length > 0 ? (
          <div className="rounded-md border border-amber-300/40 bg-amber-50/40 p-3 text-sm">
            <div className="font-medium text-amber-800">Warnings ({lastRestoreResult.stats.warnings.length})</div>
            <ul className="mt-1 list-disc pl-5 text-amber-900">
              {lastRestoreResult.stats.warnings.slice(0, 5).map((warning, index) => (
                <li key={`${warning}-${index}`}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

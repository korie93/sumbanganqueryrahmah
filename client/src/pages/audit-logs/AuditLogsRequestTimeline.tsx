import { Clock3, GitBranch } from "lucide-react";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { buildAuditRequestTimeline } from "@/pages/audit-logs/audit-log-request-timeline";
import type { AuditLogRecord } from "@/pages/audit-logs/types";
import { formatAuditTime } from "@/pages/audit-logs/utils";

type AuditLogsRequestTimelineProps = {
  loading: boolean;
  logs: AuditLogRecord[];
  requestId: string | null;
  total: number;
};

export function AuditLogsRequestTimeline({
  loading,
  logs,
  requestId,
  total,
}: AuditLogsRequestTimelineProps) {
  const timeline = useMemo(
    () => buildAuditRequestTimeline(logs, requestId),
    [logs, requestId],
  );

  if (!requestId) return null;

  return (
    <Card data-floating-ai-avoid="true">
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-label-xl text-muted-foreground">
              <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
              Request Timeline
            </p>
            <h2 className="mt-1 break-all text-base font-semibold text-foreground">
              {requestId}
            </h2>
          </div>
          <Badge variant="secondary" className="w-fit">
            {loading ? "Loading..." : `${timeline.length} shown from ${total}`}
          </Badge>
        </div>

        {loading ? (
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-sm text-muted-foreground">
            Loading request timeline...
          </div>
        ) : timeline.length === 0 ? (
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-sm text-muted-foreground">
            No audit records found for this request on the current result page.
          </div>
        ) : (
          <ol className="space-y-3" aria-label={`Audit timeline for request ${requestId}`}>
            {timeline.map((entry, index) => (
              <li key={entry.id} className="grid gap-3 rounded-xl border border-border/60 bg-muted/20 p-3 sm:grid-cols-[auto_1fr]">
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border/70 bg-background text-sm font-semibold">
                  {index + 1}
                </div>
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{entry.actionLabel}</Badge>
                    <Badge variant="secondary">{entry.riskLabel}</Badge>
                    <Badge variant="secondary">{entry.categoryLabel}</Badge>
                  </div>
                  <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
                    <p className="min-w-0 break-words">
                      <span className="font-medium text-foreground">Actor:</span> {entry.actor}
                    </p>
                    <p className="min-w-0 break-words">
                      <span className="font-medium text-foreground">Target:</span> {entry.targetUser}
                    </p>
                    <p className="flex min-w-0 items-center gap-1.5 break-words">
                      <Clock3 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {formatAuditTime(entry.timestamp)}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}


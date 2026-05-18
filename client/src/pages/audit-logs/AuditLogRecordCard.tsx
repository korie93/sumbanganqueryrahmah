import { Clock, Eye, FileText, ShieldCheck, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AuditLogRiskBadge } from "@/pages/audit-logs/AuditLogRiskBadge";
import { buildAuditLogSummary } from "@/pages/audit-logs/audit-log-classification";
import { buildAuditLogRowAriaLabel } from "@/pages/audit-logs/audit-log-row-aria";
import type { AuditLogRecord } from "@/pages/audit-logs/types";
import {
  formatAuditTime,
  getAuditActionInfo,
  getAuditDetailsPreview,
  shouldCollapseAuditDetails,
} from "@/pages/audit-logs/utils";

type AuditLogRecordCardProps = {
  isMobile: boolean;
  log: AuditLogRecord;
  onViewDetails: (log: AuditLogRecord) => void;
};

export function AuditLogRecordCard({ isMobile, log, onViewDetails }: AuditLogRecordCardProps) {
  const actionInfo = getAuditActionInfo(log.action);
  const summary = buildAuditLogSummary(log);
  const details = log.details ?? "";
  const collapseDetails = Boolean(details) && isMobile && shouldCollapseAuditDetails(details);
  const formattedTimestamp = formatAuditTime(log.timestamp);

  return (
    <div
      aria-label={buildAuditLogRowAriaLabel({
        actionLabel: actionInfo.label,
        formattedTimestamp,
        log,
        riskLabel: summary.risk.label,
      })}
      className={`space-y-3 border border-border/70 bg-card/70 shadow-xs ${
        isMobile ? "rounded-2xl p-3.5" : "rounded-xl p-4"
      }`}
      data-testid={`audit-log-${log.id}`}
      role="group"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap gap-2">
            <Badge
              variant={actionInfo.variant}
              className="max-w-full whitespace-normal break-words py-1 text-left leading-4 sm:whitespace-nowrap"
            >
              {actionInfo.label}
            </Badge>
            <AuditLogRiskBadge compact={isMobile} risk={summary.risk} />
            <Badge variant="secondary" className="max-w-full whitespace-normal py-1">
              {summary.category.label}
            </Badge>
          </div>
          <p
            className="break-all font-mono text-[11px] text-muted-foreground/80"
            data-testid={`text-action-code-${log.id}`}
          >
            {actionInfo.rawAction}
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:items-end">
          <div className={`rounded-lg border border-border/60 bg-muted/35 px-3 py-2 text-xs text-muted-foreground ${isMobile ? "" : "sm:min-w-[180px]"}`}>
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              <span className="font-medium text-foreground/85">Recorded</span>
            </div>
            <p className="mt-1 break-words leading-relaxed" data-testid={`text-timestamp-${log.id}`}>
              {formattedTimestamp}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onViewDetails(log)}
            data-testid={`button-view-audit-detail-${log.id}`}
          >
            <Eye className="mr-2 h-4 w-4" />
            View detail
          </Button>
        </div>
      </div>

      {isMobile ? (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-2.5 py-1">
            <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate" data-testid={`text-performed-by-${log.id}`}>{log.performedBy}</span>
          </span>
          {log.targetUser ? (
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-2.5 py-1">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate" data-testid={`text-target-user-${log.id}`}>{log.targetUser}</span>
            </span>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border/60 bg-background/70 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Actor
            </p>
            <div className="mt-2 flex items-start gap-2">
              <User className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="min-w-0 break-words text-sm font-medium" data-testid={`text-performed-by-${log.id}`}>
                {log.performedBy}
              </p>
            </div>
          </div>

          {log.targetUser ? (
            <div className="rounded-lg border border-border/60 bg-background/70 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Target User
              </p>
              <div className="mt-2 flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="min-w-0 break-words text-sm font-medium" data-testid={`text-target-user-${log.id}`}>
                  {log.targetUser}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {log.targetResource ? (
        <div className={`${isMobile ? "rounded-xl px-3 py-2.5" : "rounded-lg p-3"} border border-dashed border-border/70 bg-muted/20`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Resource ID
          </p>
          <p
            className="mt-1.5 break-all font-mono text-xs text-foreground/85"
            data-testid={`text-target-resource-${log.id}`}
          >
            {log.targetResource}
          </p>
        </div>
      ) : null}

      {summary.changes.length > 0 ? (
        <div className="rounded-xl border border-border/70 bg-background/70 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Changes detected
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {summary.changes.slice(0, 3).map((change) => (
              <span
                key={`${change.field}:${change.before}:${change.after}`}
                className="rounded-full border border-border/60 bg-muted/30 px-2.5 py-1 text-xs text-muted-foreground"
              >
                {change.field}: {change.before} {"->"} {change.after}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {details ? (
        <div className={`bg-muted/35 ${isMobile ? "rounded-xl p-3" : "rounded-lg p-3"}`}>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <FileText className="h-3.5 w-3.5" />
            Details
          </p>
          {collapseDetails ? (
            <details className="mt-2 rounded-md border border-border/60 bg-background/70 p-3">
              <summary
                className="cursor-pointer list-none text-left [&::-webkit-details-marker]:hidden"
                data-testid={`button-details-toggle-${log.id}`}
              >
                <p className="break-words text-sm leading-relaxed text-muted-foreground">
                  {getAuditDetailsPreview(details)}
                </p>
                <span className="mt-2 inline-flex text-xs font-medium text-primary">
                  Show full details
                </span>
              </summary>
              <pre
                className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-md border border-border/60 bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground"
                data-testid={`text-details-${log.id}`}
              >
                {details}
              </pre>
            </details>
          ) : (
            <p
              className="mt-2 break-words text-sm leading-relaxed text-muted-foreground"
              data-testid={`text-details-${log.id}`}
            >
              {details}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

import { Clipboard, Clock, Database, FileText, Fingerprint, Search, ShieldCheck, User } from "lucide-react";
import { useCallback, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { AuditLogChangeDiffViewer } from "@/pages/audit-logs/AuditLogChangeDiffViewer";
import { AuditLogReadableDetails } from "@/pages/audit-logs/AuditLogReadableDetails";
import { AuditLogReviewSignals } from "@/pages/audit-logs/AuditLogReviewSignals";
import { AuditLogRiskBadge } from "@/pages/audit-logs/AuditLogRiskBadge";
import { buildAuditLogSummary } from "@/pages/audit-logs/audit-log-classification";
import type { AuditLogRecord } from "@/pages/audit-logs/types";
import { formatAuditTime, getAuditActionInfo } from "@/pages/audit-logs/utils";
import { useToast } from "@/hooks/use-toast";

type AuditLogDetailSheetProps = {
  log: AuditLogRecord | null;
  onOpenChange: (open: boolean) => void;
  onTraceRequestId?: (requestId: string) => void;
};

function DetailBlock({
  children,
  icon,
  label,
}: {
  children: ReactNode;
  icon: ReactNode;
  label: string;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/70 p-3">
      <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-label-xl text-muted-foreground">
        {icon}
        {label}
      </p>
      <div className="mt-2 text-sm text-foreground">{children}</div>
    </div>
  );
}

export function AuditLogDetailSheet({ log, onOpenChange, onTraceRequestId }: AuditLogDetailSheetProps) {
  const { toast } = useToast();
  const open = Boolean(log);
  const actionInfo = log ? getAuditActionInfo(log.action) : null;
  const summary = log ? buildAuditLogSummary(log) : null;
  const handleCopyRequestId = useCallback(async () => {
    if (!log?.requestId) return;
    if (!navigator.clipboard?.writeText) {
      toast({
        title: "Copy not available",
        description: "Clipboard access is not available in this browser context.",
        variant: "destructive",
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(log.requestId);
      toast({
        title: "Request ID copied",
        description: "Use this ID to match audit records with server logs.",
      });
    } catch {
      toast({
        title: "Failed to copy",
        description: "Please copy the request ID manually.",
        variant: "destructive",
      });
    }
  }, [log?.requestId, toast]);
  const handleTraceRequestId = useCallback(() => {
    if (!log?.requestId || !onTraceRequestId) return;
    onTraceRequestId(log.requestId);
    onOpenChange(false);
    toast({
      title: "Request trace applied",
      description: "Audit list now filters records linked to the selected request ID.",
    });
  }, [log?.requestId, onOpenChange, onTraceRequestId, toast]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-[min(94vw,34rem)] overflow-y-auto sm:max-w-xl"
        side="right"
        data-testid="audit-log-detail-sheet"
      >
        {log && actionInfo && summary ? (
          <div className="space-y-5 pr-1">
            <SheetHeader className="pr-8">
              <SheetTitle>Audit Detail</SheetTitle>
              <SheetDescription>
                Review the selected audit record with risk, category, actor, target, and change context.
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-wrap gap-2">
              <Badge variant={actionInfo.variant} className="max-w-full whitespace-normal py-1">
                {actionInfo.label}
              </Badge>
              <AuditLogRiskBadge risk={summary.risk} />
              <Badge variant="secondary" className="max-w-full whitespace-normal py-1">
                {summary.category.label}
              </Badge>
            </div>

            <AuditLogReviewSignals log={log} />

            <div className="grid gap-3 sm:grid-cols-2">
              <DetailBlock icon={<User className="h-3.5 w-3.5" aria-hidden="true" />} label="Performed By">
                <p className="break-words font-medium">{log.performedBy}</p>
              </DetailBlock>
              <DetailBlock icon={<Clock className="h-3.5 w-3.5" aria-hidden="true" />} label="Recorded">
                <p className="break-words">{formatAuditTime(log.timestamp)}</p>
              </DetailBlock>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <DetailBlock icon={<ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />} label="Target User">
                <p className="break-words">{log.targetUser || "-"}</p>
              </DetailBlock>
              <DetailBlock icon={<Database className="h-3.5 w-3.5" aria-hidden="true" />} label="Resource">
                <p className="break-all font-mono text-xs">{log.targetResource || "-"}</p>
              </DetailBlock>
            </div>

            <DetailBlock icon={<Fingerprint className="h-3.5 w-3.5" aria-hidden="true" />} label="Request ID">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="break-all font-mono text-xs">{log.requestId || "-"}</p>
                {log.requestId ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleCopyRequestId()}
                      data-testid="button-copy-audit-request-id"
                    >
                      <Clipboard className="mr-2 h-4 w-4" />
                      Copy
                    </Button>
                    {onTraceRequestId ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleTraceRequestId}
                        data-testid="button-trace-audit-request-id"
                      >
                        <Search className="mr-2 h-4 w-4" />
                        Trace
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </DetailBlock>

            <AuditLogChangeDiffViewer changes={summary.changes} />

            <section className="rounded-xl border border-border/70 bg-muted/20 p-3" aria-labelledby="audit-raw-details-title">
              <h3
                id="audit-raw-details-title"
                className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-label-xl text-muted-foreground"
              >
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                Details
              </h3>
              <AuditLogReadableDetails details={log.details || ""} showRaw />
            </section>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

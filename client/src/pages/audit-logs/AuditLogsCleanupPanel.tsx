import { AlertTriangle, ChevronDown, RefreshCw, Settings, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import type { AuditLogRecord, AuditLogStats } from "@/pages/audit-logs/types";
import { formatAuditTime } from "@/pages/audit-logs/utils";

interface AuditLogsCleanupPanelProps {
  cleanupDays: string;
  cleanupDialogOpen: boolean;
  cleanupLoading: boolean;
  cleanupOpen: boolean;
  canCleanupLogs: boolean;
  logs: AuditLogRecord[];
  logsToDeleteCount: number;
  onCleanupDaysChange: (value: string) => void;
  onCleanupDialogOpenChange: (open: boolean) => void;
  onCleanupOpenChange: (open: boolean) => void;
  onConfirmCleanup: () => void;
  stats: AuditLogStats | null;
}

export function AuditLogsCleanupPanel({
  cleanupDays,
  cleanupDialogOpen,
  cleanupLoading,
  cleanupOpen,
  canCleanupLogs,
  logs,
  logsToDeleteCount,
  onCleanupDaysChange,
  onCleanupDialogOpenChange,
  onCleanupOpenChange,
  onConfirmCleanup,
  stats,
}: AuditLogsCleanupPanelProps) {
  const isMobile = useIsMobile();
  const cleanupDaysTriggerId = "cleanup-days";

  if (!canCleanupLogs) {
    return null;
  }

  const cleanupImpactText = logsToDeleteCount > 0
    ? (
      <>
        This action will affect approximately{" "}
        <span className="font-semibold text-foreground">{logsToDeleteCount}</span>{" "}
        log entries.
      </>
    )
    : "No audit logs match the selected cleanup rule.";

  const cleanupButtonLabel = logsToDeleteCount > 0
    ? `Cleanup (${logsToDeleteCount} logs)`
    : "No Logs to Cleanup";

  return (
    <>
      <Card data-floating-ai-avoid="true">
        <Collapsible open={cleanupOpen} onOpenChange={onCleanupOpenChange}>
          <CardHeader className={isMobile ? "pb-2.5" : "pb-3"}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="h-auto w-full justify-between gap-3 rounded-xl px-0 py-0 text-left sm:w-auto sm:justify-start">
                  <div className="flex min-w-0 items-center gap-2">
                    <Settings className="h-5 w-5 shrink-0" />
                    <div className="min-w-0">
                      <CardTitle className={isMobile ? "text-base" : "text-lg"}>Log Cleanup</CardTitle>
                      <p className={`mt-1 text-muted-foreground ${isMobile ? "text-xs" : "text-sm"}`}>
                        {isMobile
                          ? "Review retention impact before deleting older audit logs."
                          : "Review retention counts before deleting older audit logs."}
                      </p>
                    </div>
                  </div>
                  <ChevronDown className={`h-4 w-4 transition-transform ${cleanupOpen ? "rotate-180" : ""}`} />
                </Button>
              </CollapsibleTrigger>
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="space-y-5">
              {isMobile ? (
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px]" data-testid="text-total-logs">
                    Total {stats?.total ?? logs.length}
                  </Badge>
                  <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px]" data-testid="text-old-30-days">
                    30+ days {stats?.olderThan30Days ?? 0}
                  </Badge>
                  <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px]" data-testid="text-old-90-days">
                    90+ days {stats?.olderThan90Days ?? 0}
                  </Badge>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <div className="space-y-1 rounded-lg bg-muted/30 p-4">
                    <p className="text-sm text-muted-foreground">Total Logs</p>
                    <p className="text-2xl font-bold" data-testid="text-total-logs">
                      {stats?.total ?? logs.length}
                    </p>
                  </div>
                  <div className="space-y-1 rounded-lg bg-muted/30 p-4">
                    <p className="text-sm text-muted-foreground">Older than 30 Days</p>
                    <p className="text-2xl font-bold text-amber-600 dark:text-amber-400" data-testid="text-old-30-days">
                      {stats?.olderThan30Days ?? 0}
                    </p>
                  </div>
                  <div className="space-y-1 rounded-lg bg-muted/30 p-4">
                    <p className="text-sm text-muted-foreground">Older than 90 Days</p>
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400" data-testid="text-old-90-days">
                      {stats?.olderThan90Days ?? 0}
                    </p>
                  </div>
                </div>
              )}

              {stats?.oldestLogDate ? (
                <p className={`text-muted-foreground ${isMobile ? "text-xs" : "text-sm"}`}>
                  Oldest log entry: {formatAuditTime(stats.oldestLogDate)}
                </p>
              ) : null}

              <div
                className="rounded-xl border border-destructive/20 bg-destructive/[0.04] p-4"
                data-floating-ai-avoid="true"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div className="w-full max-w-md space-y-2">
                    <Label htmlFor={cleanupDaysTriggerId} className="text-sm font-medium">
                      Delete logs older than
                    </Label>
                    <Select value={cleanupDays} onValueChange={onCleanupDaysChange}>
                      <SelectTrigger
                        id={cleanupDaysTriggerId}
                        className="h-11 w-full sm:w-[220px]"
                        data-testid="select-cleanup-days"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30">30 days</SelectItem>
                        <SelectItem value="60">60 days</SelectItem>
                        <SelectItem value="90">90 days</SelectItem>
                        <SelectItem value="180">180 days</SelectItem>
                        <SelectItem value="365">1 year</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className={`leading-relaxed text-muted-foreground ${isMobile ? "text-xs" : "text-sm"}`}>
                      Cleanup still requires confirmation before any audit entries are removed.
                    </p>
                  </div>

                  <div className="w-full space-y-2 lg:max-w-xs lg:text-right">
                    <p className={`text-muted-foreground ${isMobile ? "text-xs" : "text-sm"}`}>{cleanupImpactText}</p>
                    <Button
                      variant="destructive"
                      onClick={() => onCleanupDialogOpenChange(true)}
                      disabled={cleanupLoading || logsToDeleteCount === 0}
                      className="h-11 w-full lg:w-auto"
                      data-testid="button-cleanup-logs"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {cleanupButtonLabel}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <AlertDialog open={cleanupDialogOpen} onOpenChange={onCleanupDialogOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Confirm Cleanup
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all audit logs older than {cleanupDays} days.
              This action cannot be undone. Approximately {logsToDeleteCount} log entries will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cleanupLoading} data-testid="button-cancel-cleanup">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirmCleanup}
              disabled={cleanupLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-cleanup"
            >
              {cleanupLoading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Logs
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

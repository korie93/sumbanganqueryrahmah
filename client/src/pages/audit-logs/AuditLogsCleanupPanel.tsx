import { AlertTriangle, ChevronDown, RefreshCw, Settings, Trash2 } from "lucide-react";
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
  if (!canCleanupLogs) {
    return null;
  }

  return (
    <>
      <Card>
        <Collapsible open={cleanupOpen} onOpenChange={onCleanupOpenChange}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="p-0 h-auto gap-2">
                  <Settings className="h-5 w-5" />
                  <CardTitle className="text-lg">Log Cleanup</CardTitle>
                  <ChevronDown className={`h-4 w-4 transition-transform ${cleanupOpen ? "rotate-180" : ""}`} />
                </Button>
              </CollapsibleTrigger>
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg bg-muted/30 space-y-1">
                  <p className="text-sm text-muted-foreground">Total Logs</p>
                  <p className="text-2xl font-bold" data-testid="text-total-logs">
                    {stats?.total ?? logs.length}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-muted/30 space-y-1">
                  <p className="text-sm text-muted-foreground">Older than 30 Days</p>
                  <p className="text-2xl font-bold text-amber-600 dark:text-amber-400" data-testid="text-old-30-days">
                    {stats?.olderThan30Days ?? 0}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-muted/30 space-y-1">
                  <p className="text-sm text-muted-foreground">Older than 90 Days</p>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400" data-testid="text-old-90-days">
                    {stats?.olderThan90Days ?? 0}
                  </p>
                </div>
              </div>

              {stats?.oldestLogDate ? (
                <p className="text-sm text-muted-foreground">
                  Oldest log entry: {formatAuditTime(stats.oldestLogDate)}
                </p>
              ) : null}

              <div className="flex items-end gap-4 flex-wrap pt-2 border-t">
                <div className="space-y-2">
                  <Label htmlFor="cleanup-days" className="text-sm font-medium">
                    Delete logs older than (days)
                  </Label>
                  <Select value={cleanupDays} onValueChange={onCleanupDaysChange}>
                    <SelectTrigger className="w-[180px]" data-testid="select-cleanup-days">
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
                </div>
                <Button
                  variant="destructive"
                  onClick={() => onCleanupDialogOpenChange(true)}
                  disabled={cleanupLoading || logsToDeleteCount === 0}
                  data-testid="button-cleanup-logs"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Cleanup ({logsToDeleteCount} logs)
                </Button>
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

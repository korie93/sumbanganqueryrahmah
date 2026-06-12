import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import {
  OperationalMetric,
  OperationalSectionCard,
  OperationalSummaryStrip,
} from "@/components/layout/OperationalPage";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  cleanupEndedActivityLogs,
  getActivityRetentionStatus,
  type ActivityRetentionStatus,
} from "@/lib/api";
import { logClientError } from "@/lib/client-logger";
import { useToast } from "@/hooks/use-toast";
import { ActivityConfirmationDialog } from "@/pages/activity/ActivityConfirmationDialog";

type ActivityRetentionPanelProps = {
  onCleanupComplete: () => void;
};

function readRetentionError(error: unknown): string | null {
  if (error instanceof DOMException && error.name === "AbortError") {
    return null;
  }
  return error instanceof Error
    ? error.message
    : "Activity retention status could not be loaded.";
}

export function ActivityRetentionPanel({
  onCleanupComplete,
}: ActivityRetentionPanelProps) {
  const { toast } = useToast();
  const [retention, setRetention] = useState<ActivityRetentionStatus | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false);
  const mountedRef = useRef(true);
  const statusControllerRef = useRef<AbortController | null>(null);
  const cleanupControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      statusControllerRef.current?.abort();
      cleanupControllerRef.current?.abort();
      statusControllerRef.current = null;
      cleanupControllerRef.current = null;
    };
  }, []);

  const loadRetention = useCallback(async () => {
    statusControllerRef.current?.abort();
    const controller = new AbortController();
    statusControllerRef.current = controller;
    setLoading(true);
    setErrorMessage(null);

    try {
      const nextRetention = await getActivityRetentionStatus({
        signal: controller.signal,
      });
      if (!controller.signal.aborted && mountedRef.current) {
        setRetention(nextRetention);
      }
    } catch (error) {
      const message = readRetentionError(error);
      if (message && mountedRef.current) {
        setErrorMessage(message);
        logClientError("Failed to load activity retention status", error, {
          event: "activity_retention_status_failed",
        });
      }
    } finally {
      if (statusControllerRef.current === controller) {
        statusControllerRef.current = null;
      }
      if (mountedRef.current && !controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadRetention();
  }, [loadRetention]);

  const handleCleanup = useCallback(async () => {
    cleanupControllerRef.current?.abort();
    const controller = new AbortController();
    cleanupControllerRef.current = controller;
    setCleanupLoading(true);
    setCleanupDialogOpen(false);

    try {
      const result = await cleanupEndedActivityLogs(undefined, {
        signal: controller.signal,
      });
      if (controller.signal.aborted || !mountedRef.current) {
        return;
      }

      toast({
        title: result.skipped ? "Cleanup not started" : "Activity cleanup complete",
        description: result.skipped
          ? "Another server worker is already running the retention cleanup."
          : `${result.deletedCount} eligible activity log${result.deletedCount === 1 ? "" : "s"} removed. Active bans remained protected.`,
        dedupeKey: "activity-retention-cleanup",
        historyModule: "Activity",
        variant: result.skipped ? "warning" : "default",
      });
      await loadRetention();
      onCleanupComplete();
    } catch (error) {
      const message = readRetentionError(error);
      if (message && mountedRef.current) {
        toast({
          title: "Activity cleanup failed",
          description: message,
          dedupeKey: "activity-retention-cleanup-failed",
          historyModule: "Activity",
          variant: "destructive",
        });
        logClientError("Failed to clean up activity logs", error, {
          event: "activity_retention_cleanup_failed",
        });
      }
    } finally {
      if (cleanupControllerRef.current === controller) {
        cleanupControllerRef.current = null;
      }
      if (mountedRef.current) {
        setCleanupLoading(false);
      }
    }
  }, [loadRetention, onCleanupComplete, toast]);

  const policy = retention?.policy;
  const preview = retention?.preview;

  return (
    <>
      <OperationalSectionCard
        title="Activity Retention"
        description="Keeps ended session history bounded while preserving active bans and longer-lived security events."
        badge={(
          <Badge
            className="self-start"
            variant={policy?.autoCleanupEnabled ? "default" : "outline"}
          >
            {loading ? "Checking policy" : policy?.autoCleanupEnabled ? "Auto cleanup on" : "Auto cleanup off"}
          </Badge>
        )}
        actions={(
          <div className="flex w-full gap-2 sm:w-auto">
            <Button
              aria-label="Refresh activity retention status"
              disabled={loading || cleanupLoading}
              onClick={() => void loadRetention()}
              size="icon"
              title="Refresh retention status"
              variant="outline"
            >
              <RefreshCw className={loading ? "animate-spin" : ""} />
            </Button>
            <Button
              className="flex-1 sm:flex-none"
              disabled={loading || cleanupLoading || !retention}
              onClick={() => setCleanupDialogOpen(true)}
              variant="outline"
            >
              <Trash2 />
              {cleanupLoading ? "Cleaning..." : "Run cleanup"}
            </Button>
          </div>
        )}
      >
        {errorMessage ? (
          <Alert variant="destructive">
            <AlertTitle>Retention status unavailable</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}

        <OperationalSummaryStrip className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <OperationalMetric
            label="Eligible now"
            value={loading ? "-" : preview?.totalEligibleCount ?? 0}
            supporting={`Standard policy: ${policy?.standardRetentionDays ?? 90} days`}
          />
          <OperationalMetric
            label="Security history"
            value={loading ? "-" : preview?.securityEligibleCount ?? 0}
            supporting={`Retained for ${policy?.securityRetentionDays ?? 365} days`}
            tone="warning"
          />
          <OperationalMetric
            label="Protected bans"
            value={loading ? "-" : preview?.protectedActiveBanCount ?? 0}
            supporting="Never removed while the ban remains active"
            tone="success"
          />
          <OperationalMetric
            label="Batch limit"
            value={loading ? "-" : policy?.batchSize ?? 500}
            supporting="Maximum records per cleanup run"
          />
        </OperationalSummaryStrip>

        <div className="flex items-start gap-3 border-t pt-4 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <p>
            Kicked and historical banned sessions use the longer security policy.
            Records linked to an active ban are excluded from deletion.
          </p>
        </div>
      </OperationalSectionCard>

      <ActivityConfirmationDialog
        confirmClassName="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        confirmLabel="Run cleanup"
        description={`Remove up to ${policy?.batchSize ?? 500} eligible ended activity logs now? Active bans will remain protected.`}
        icon={<Trash2 className="h-5 w-5 text-destructive" />}
        onConfirm={() => void handleCleanup()}
        onOpenChange={setCleanupDialogOpen}
        open={cleanupDialogOpen}
        testId="activity-retention-cleanup-confirm"
        title="Run activity retention cleanup?"
      />
    </>
  );
}

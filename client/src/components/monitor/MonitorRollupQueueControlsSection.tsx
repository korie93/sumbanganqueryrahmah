import { memo } from "react";
import { InfoHint } from "@/components/monitor/InfoHint";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { MonitorSnapshot } from "@/hooks/useSystemMetrics";
import { formatMonitorDurationCompact } from "@/components/monitor/monitorData";

type RollupQueueAction = "drain" | "retry-failures" | "auto-heal" | "rebuild" | null;

type MonitorRollupQueueControlsSectionProps = {
  canManageRollups: boolean;
  snapshot: MonitorSnapshot;
  busyAction: RollupQueueAction;
  lastMessage: string | null;
  onDrain: () => void;
  onRetryFailures: () => void;
  onAutoHeal: () => void;
  onRebuild: () => void;
};

function MonitorRollupQueueControlsSectionImpl({
  canManageRollups,
  snapshot,
  busyAction,
  lastMessage,
  onDrain,
  onRetryFailures,
  onAutoHeal,
  onRebuild,
}: MonitorRollupQueueControlsSectionProps) {
  if (!canManageRollups) {
    return null;
  }

  const oldestAgeLabel = formatMonitorDurationCompact(snapshot.rollupRefreshOldestPendingAgeMs);
  const queueBusy = busyAction !== null;

  return (
    <section>
      <Card className="border-border/60 bg-background/35 backdrop-blur-sm">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Rollup Queue Controls
                </p>
                <InfoHint text="Operational controls for collection report refresh queue recovery and rebuild actions." />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Pending {snapshot.rollupRefreshPendingCount}, running {snapshot.rollupRefreshRunningCount}, retry {snapshot.rollupRefreshRetryCount}, oldest {oldestAgeLabel}.
              </p>
            </div>
            {lastMessage ? (
              <p className="text-xs text-muted-foreground">{lastMessage}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={queueBusy}
              onClick={onDrain}
            >
              {busyAction === "drain" ? "Draining..." : "Drain Queue Now"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={queueBusy}
              onClick={onRetryFailures}
            >
              {busyAction === "retry-failures" ? "Retrying..." : "Retry Failures"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={queueBusy}
              onClick={onAutoHeal}
            >
              {busyAction === "auto-heal" ? "Healing..." : "Auto-Heal Queue"}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={queueBusy}
              onClick={onRebuild}
            >
              {busyAction === "rebuild" ? "Rebuilding..." : "Rebuild Rollups"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Rebuild recalculates collection summary rollups from the source records. Use it when queue lag stays stale or after exceptional recovery work.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

export const MonitorRollupQueueControlsSection = memo(MonitorRollupQueueControlsSectionImpl);

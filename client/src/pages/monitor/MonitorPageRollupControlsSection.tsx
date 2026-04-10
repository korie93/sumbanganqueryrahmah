import { Suspense, lazy } from "react";
import {
  MonitorSectionCardFallback,
  useDeferredMonitorSectionMount,
} from "@/components/monitor/MonitorDeferredSection";
import { useMonitorPageContext } from "@/pages/monitor/MonitorPageContext";

const MonitorRollupQueueControlsSection = lazy(() =>
  import("@/components/monitor/MonitorRollupQueueControlsSection").then((module) => ({
    default: module.MonitorRollupQueueControlsSection,
  })),
);

export function MonitorPageRollupControlsSection() {
  const {
    deferSecondaryMobileSections,
    canManageRollups,
    snapshot,
    queueActionBusy,
    lastQueueActionMessage,
    runRollupAction,
  } = useMonitorPageContext();
  const { shouldRender, triggerRef } = useDeferredMonitorSectionMount({
    enabled: deferSecondaryMobileSections && canManageRollups,
  });

  if (!canManageRollups) {
    return null;
  }

  return (
    <div ref={triggerRef}>
      {shouldRender ? (
        <Suspense fallback={<MonitorSectionCardFallback title="Loading rollup controls" />}>
          <MonitorRollupQueueControlsSection
            canManageRollups={canManageRollups}
            snapshot={snapshot}
            busyAction={queueActionBusy}
            lastMessage={lastQueueActionMessage}
            onDrain={() => void runRollupAction("drain")}
            onRetryFailures={() => void runRollupAction("retry-failures")}
            onAutoHeal={() => void runRollupAction("auto-heal")}
            onRebuild={() => void runRollupAction("rebuild")}
          />
        </Suspense>
      ) : (
        <MonitorSectionCardFallback title="Loading rollup controls" />
      )}
    </div>
  );
}

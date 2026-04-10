import { Suspense, lazy } from "react";
import {
  MonitorSectionCardFallback,
  useDeferredMonitorSectionMount,
} from "@/components/monitor/MonitorDeferredSection";
import { useMonitorPageContext } from "@/pages/monitor/MonitorPageContext";

const MonitorAlertsSection = lazy(() =>
  import("@/components/monitor/MonitorAlertsSection").then((module) => ({
    default: module.MonitorAlertsSection,
  })),
);

export function MonitorPageAlertsSection() {
  const {
    deferSecondaryMobileSections,
    alertsOpen,
    setAlertsOpen,
    alertHistoryOpen,
    setAlertHistoryOpen,
    alerts,
    alertsPage,
    alertsPagination,
    setAlertsPage,
    alertHistory,
    alertHistoryPage,
    alertHistoryPagination,
    setAlertHistoryPage,
    canDeleteAlertHistory,
    deleteAlertHistoryBusy,
    handleDeleteOldAlertHistory,
  } = useMonitorPageContext();
  const { shouldRender, triggerRef } = useDeferredMonitorSectionMount({
    enabled: deferSecondaryMobileSections,
  });

  return (
    <div ref={triggerRef}>
      {shouldRender ? (
        <Suspense fallback={<MonitorSectionCardFallback title="Loading alerts" blocks={3} />}>
          <MonitorAlertsSection
            alertsOpen={alertsOpen}
            onAlertsOpenChange={setAlertsOpen}
            alertHistoryOpen={alertHistoryOpen}
            onAlertHistoryOpenChange={setAlertHistoryOpen}
            alerts={alerts}
            alertsPage={alertsPage}
            alertsPagination={alertsPagination}
            onAlertsPageChange={setAlertsPage}
            alertHistory={alertHistory}
            alertHistoryPage={alertHistoryPage}
            alertHistoryPagination={alertHistoryPagination}
            onAlertHistoryPageChange={setAlertHistoryPage}
            canDeleteHistory={canDeleteAlertHistory}
            deleteHistoryBusy={deleteAlertHistoryBusy}
            onDeleteOldHistory={handleDeleteOldAlertHistory}
          />
        </Suspense>
      ) : (
        <MonitorSectionCardFallback title="Loading alerts" blocks={3} />
      )}
    </div>
  );
}

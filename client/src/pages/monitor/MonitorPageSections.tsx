import { OperationalPage } from "@/components/layout/OperationalPage";
import { MonitorPageAlertsSection } from "@/pages/monitor/MonitorPageAlertsSection";
import { MonitorPageChaosSection } from "@/pages/monitor/MonitorPageChaosSection";
import { MonitorPageFooter } from "@/pages/monitor/MonitorPageFooter";
import { MonitorPageHeaderSection } from "@/pages/monitor/MonitorPageHeaderSection";
import { MonitorPageInsightsSection } from "@/pages/monitor/MonitorPageInsightsSection";
import { MonitorPageMetricsSection } from "@/pages/monitor/MonitorPageMetricsSection";
import { MonitorPageOverviewSection } from "@/pages/monitor/MonitorPageOverviewSection";
import { MonitorPageRollupControlsSection } from "@/pages/monitor/MonitorPageRollupControlsSection";
import { MonitorPageTechnicalSection } from "@/pages/monitor/MonitorPageTechnicalSection";
import { MonitorPageWebVitalsSection } from "@/pages/monitor/MonitorPageWebVitalsSection";

export {
  MonitorPageAlertsSection,
  MonitorPageChaosSection,
  MonitorPageFooter,
  MonitorPageHeaderSection,
  MonitorPageInsightsSection,
  MonitorPageMetricsSection,
  MonitorPageOverviewSection,
  MonitorPageRollupControlsSection,
  MonitorPageTechnicalSection,
  MonitorPageWebVitalsSection,
};

export function MonitorPageShell() {
  return (
    <OperationalPage width="content" className="space-y-4 sm:space-y-6">
      <MonitorPageHeaderSection />

      <div className="space-y-4 sm:space-y-6">
        <MonitorPageOverviewSection />
        <MonitorPageWebVitalsSection />
        <MonitorPageMetricsSection />
        <MonitorPageRollupControlsSection />
        <MonitorPageAlertsSection />
        <MonitorPageInsightsSection />
        <MonitorPageChaosSection />
        <MonitorPageTechnicalSection />
        <MonitorPageFooter />
      </div>
    </OperationalPage>
  );
}

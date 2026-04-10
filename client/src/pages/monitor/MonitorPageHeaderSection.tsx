import {
  OperationalPageHeader,
} from "@/components/layout/OperationalPage";
import { Button } from "@/components/ui/button";
import { useMonitorPageContext } from "@/pages/monitor/MonitorPageContext";
import { renderMonitorSummaryBadges } from "@/pages/monitor/monitor-page-summary-badges";

export function MonitorPageHeaderSection() {
  const { headerDescription, headerFacts, refreshNow, isMobile, isLoading } = useMonitorPageContext();

  return (
    <OperationalPageHeader
      title={<span data-testid="text-monitor-title">System Performance</span>}
      eyebrow="Insights"
      description={headerDescription}
      badge={<div className="flex flex-wrap gap-2">{renderMonitorSummaryBadges(headerFacts, "rounded-full px-3 py-1 text-xs")}</div>}
      actions={
        <Button
          type="button"
          variant="outline"
          onClick={() => void refreshNow()}
          className={isMobile ? "w-full" : "w-full sm:w-auto"}
        >
          {isLoading ? "Refreshing..." : "Refresh"}
        </Button>
      }
      className={isMobile ? "rounded-[28px] border-border/60 bg-background/85" : undefined}
    />
  );
}

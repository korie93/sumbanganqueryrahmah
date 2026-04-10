import { useMonitorPageContext } from "@/pages/monitor/MonitorPageContext";

export function MonitorPageFooter() {
  const { isMobile, isLoading, lastUpdatedLabel } = useMonitorPageContext();

  return (
    <p className={isMobile ? "text-left text-xs text-muted-foreground" : "text-right text-xs text-muted-foreground"}>
      {isLoading ? "Loading..." : `Last updated: ${lastUpdatedLabel}`}
    </p>
  );
}

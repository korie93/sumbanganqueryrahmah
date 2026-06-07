import { Download, RefreshCw } from "lucide-react";
import { OperationalPageHeader } from "@/components/layout/OperationalPage";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  formatDashboardFreshnessLabel,
  resolveDashboardFreshnessStatusMessage,
} from "@/pages/dashboard/dashboard-freshness";
import { resolveDashboardExportStatusMessage, type DashboardExportBlockReason } from "@/pages/dashboard/export-guards";

type DashboardPageHeaderProps = {
  isMobile: boolean;
  kpiCount: number;
  trendDays: number;
  hasDashboardErrors: boolean;
  latestUpdatedAt: number | null;
  exportingPdf: boolean;
  exportBlockReason: DashboardExportBlockReason | null;
  refreshing: boolean;
  onExportPdf: () => void;
  onRefresh: () => void;
};

export function DashboardPageHeader({
  isMobile,
  kpiCount,
  trendDays,
  hasDashboardErrors,
  latestUpdatedAt,
  exportingPdf,
  exportBlockReason,
  refreshing,
  onExportPdf,
  onRefresh,
}: DashboardPageHeaderProps) {
  const exportStatusMessage = resolveDashboardExportStatusMessage({
    exportBlockReason,
    exportingPdf,
    refreshing,
  });
  const freshnessLabel = formatDashboardFreshnessLabel(latestUpdatedAt);
  const freshnessStatusMessage = resolveDashboardFreshnessStatusMessage({
    hasDashboardErrors,
    latestUpdatedAt,
    refreshing,
  });

  return (
    <OperationalPageHeader
      title={<span data-testid="text-dashboard-title">Login & Access Dashboard</span>}
      eyebrow="Access Insights"
      description={
        isMobile
          ? "Pantau login, sesi aktif, dan risiko akaun dalam paparan ringkas."
          : "Pantau aktiviti log masuk, sesi aktif, kegagalan akses, dan risiko akaun dalam satu workspace operasi."
      }
      badge={
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="rounded-full px-3 py-1.5">
            Trend {trendDays}d
          </Badge>
          <Badge variant="outline" className="rounded-full px-3 py-1.5">
            {kpiCount} KPI akses
          </Badge>
          <Badge variant="outline" className="rounded-full px-3 py-1.5">
            Auto refresh
          </Badge>
          <Badge
            variant={hasDashboardErrors ? "destructive" : "outline"}
            className="rounded-full px-3 py-1.5"
            data-testid="badge-dashboard-freshness"
            aria-label={freshnessStatusMessage}
          >
            {freshnessLabel}
          </Badge>
        </div>
      }
      actions={
        <>
          <Button
            type="button"
            aria-describedby="dashboard-export-status"
            onClick={onExportPdf}
            variant="outline"
            disabled={exportBlockReason !== null}
            data-testid="button-export-pdf"
            className={isMobile ? "h-11 w-full rounded-xl" : "h-11 w-full rounded-xl sm:w-auto"}
          >
            {exportingPdf ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            Export PDF
          </Button>
          <Button
            type="button"
            onClick={onRefresh}
            variant="outline"
            disabled={refreshing}
            data-testid="button-refresh-dashboard"
            className={isMobile ? "h-11 w-full rounded-xl" : "h-11 w-full rounded-xl sm:w-auto"}
          >
            <RefreshCw className={`w-4 h-4 mr-2${refreshing ? " animate-spin" : ""}`} />
            Refresh
          </Button>
          <p
            id="dashboard-export-status"
            role="status"
            aria-live="polite"
            data-testid="text-dashboard-export-status"
            className="text-xs leading-5 text-muted-foreground sm:basis-full xl:max-w-[22rem] xl:text-right"
          >
            {exportStatusMessage}
          </p>
        </>
      }
      className={isMobile ? "rounded-[28px] border-border/60 bg-background shadow-sm" : "border-border/60 bg-background shadow-sm"}
    />
  );
}

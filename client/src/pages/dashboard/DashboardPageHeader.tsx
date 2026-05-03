import { Download, RefreshCw } from "lucide-react";
import { OperationalPageHeader } from "@/components/layout/OperationalPage";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type DashboardPageHeaderProps = {
  isMobile: boolean;
  trendDays: number;
  exportingPdf: boolean;
  exportBlockReason: string | null;
  refreshing: boolean;
  onExportPdf: () => void;
  onRefresh: () => void;
};

export function DashboardPageHeader({
  isMobile,
  trendDays,
  exportingPdf,
  exportBlockReason,
  refreshing,
  onExportPdf,
  onRefresh,
}: DashboardPageHeaderProps) {
  return (
    <OperationalPageHeader
      title={<span data-testid="text-dashboard-title">Dashboard Analytics</span>}
      eyebrow="Insights"
      description={
        isMobile
          ? "System health, activity, and usage insights in one compact mobile-friendly view."
          : "System overview, activity signals, and analytics in one compact workspace."
      }
      badge={
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="rounded-full px-3 py-1.5">
            Trend {trendDays}d
          </Badge>
          <Badge variant="outline" className="rounded-full px-3 py-1.5">
            7 KPI cards
          </Badge>
          <Badge variant="outline" className="rounded-full px-3 py-1.5">
            Auto refresh
          </Badge>
        </div>
      }
      actions={
        <>
          <Button
            type="button"
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
        </>
      }
      className={isMobile ? "rounded-[28px] border-border/60 bg-background shadow-sm" : "border-border/60 bg-background shadow-sm"}
    />
  );
}

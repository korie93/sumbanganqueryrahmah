import { memo } from "react";
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

export const DashboardPageHeader = memo(function DashboardPageHeader({
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
          ? "System health, activity, and usage insights in one mobile-friendly view."
          : "System overview and activity insights."
      }
      badge={
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="rounded-full px-3 py-1">
            Trend {trendDays}d
          </Badge>
          <Badge variant="outline" className="rounded-full px-3 py-1">
            7 summary cards
          </Badge>
        </div>
      }
      actions={
        <>
          <Button
            onClick={onExportPdf}
            variant="outline"
            disabled={exportBlockReason !== null}
            data-testid="button-export-pdf"
            className={isMobile ? "w-full" : "w-full sm:w-auto"}
          >
            {exportingPdf ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            Export PDF
          </Button>
          <Button
            onClick={onRefresh}
            variant="outline"
            disabled={refreshing}
            data-testid="button-refresh-dashboard"
            className={isMobile ? "w-full" : "w-full sm:w-auto"}
          >
            <RefreshCw className={`w-4 h-4 mr-2${refreshing ? " animate-spin" : ""}`} />
            Refresh
          </Button>
        </>
      }
      className={isMobile ? "rounded-[28px] border-border/60 bg-background/85" : undefined}
    />
  );
});

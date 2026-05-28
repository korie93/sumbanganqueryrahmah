import { AlertTriangle, Layers, ShieldCheck } from "lucide-react";
import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { buildAuditLogSummary, type AuditRiskLevel } from "@/pages/audit-logs/audit-log-classification";
import { getAuditReviewSignals } from "@/pages/audit-logs/audit-log-review-signals";
import type { AuditLogRecord } from "@/pages/audit-logs/types";

type AuditLogsSummaryStripProps = {
  loading: boolean;
  logs: AuditLogRecord[];
  total: number;
};

const riskOrder: AuditRiskLevel[] = ["critical", "high", "medium", "low"];

const riskLabels: Record<AuditRiskLevel, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export function AuditLogsSummaryStrip({ loading, logs, total }: AuditLogsSummaryStripProps) {
  const summary = useMemo(() => {
    const riskCounts = logs.reduce<Record<AuditRiskLevel, number>>(
      (counts, log) => {
        const risk = buildAuditLogSummary(log).risk.level;
        counts[risk] += 1;
        return counts;
      },
      { critical: 0, high: 0, medium: 0, low: 0 },
    );
    const categories = new Set(logs.map((log) => buildAuditLogSummary(log).category.label));
    const reviewCount = logs.filter((log) => getAuditReviewSignals(log).length > 0).length;
    return { categories, reviewCount, riskCounts };
  }, [logs]);
  const { categories, reviewCount, riskCounts } = summary;
  const visibleRiskCount = riskCounts.critical + riskCounts.high;

  return (
    <Card data-floating-ai-avoid="true">
      <CardContent className="grid gap-3 p-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border/60 bg-muted/25 p-3">
          <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-label-xl text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Audit Scope
          </p>
          <p className="mt-2 text-sm font-medium">
            {loading ? "Loading audit records..." : `${logs.length} shown from ${total} total`}
          </p>
        </div>
        <div className="rounded-xl border border-border/60 bg-muted/25 p-3">
          <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-label-xl text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            Risk Snapshot
          </p>
          <p className="mt-2 text-sm font-medium">
            {visibleRiskCount > 0 ? `${visibleRiskCount} high attention item${visibleRiskCount === 1 ? "" : "s"}` : "No high attention items shown"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {reviewCount > 0 ? `${reviewCount} item${reviewCount === 1 ? "" : "s"} flagged for review` : "No review signals on this page"}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
            {riskOrder.map((risk) => (
              <span key={risk} className="rounded-full border border-border/60 bg-background/70 px-2 py-0.5">
                {riskLabels[risk]} {riskCounts[risk]}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-border/60 bg-muted/25 p-3">
          <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-label-xl text-muted-foreground">
            <Layers className="h-3.5 w-3.5" aria-hidden="true" />
            Categories
          </p>
          <p className="mt-2 text-sm font-medium">
            {categories.size > 0 ? `${categories.size} category group${categories.size === 1 ? "" : "s"} shown` : "No categories shown"}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

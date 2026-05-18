import { AlertTriangle, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AuditRiskInfo } from "@/pages/audit-logs/audit-log-classification";

type AuditLogRiskBadgeProps = {
  risk: AuditRiskInfo;
  compact?: boolean;
};

const riskClassNames: Record<AuditRiskInfo["level"], string> = {
  low: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/35 dark:text-emerald-200",
  medium: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/70 dark:bg-sky-950/35 dark:text-sky-200",
  high: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/35 dark:text-amber-200",
  critical: "border-red-200 bg-red-50 text-red-900 dark:border-red-900/70 dark:bg-red-950/35 dark:text-red-200",
};

export function AuditLogRiskBadge({ compact = false, risk }: AuditLogRiskBadgeProps) {
  const Icon = risk.level === "low" || risk.level === "medium" ? ShieldCheck : AlertTriangle;

  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 border py-1", riskClassNames[risk.level])}
      title={risk.description}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {compact ? risk.label : `Risk: ${risk.label}`}
    </Badge>
  );
}

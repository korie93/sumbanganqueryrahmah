import { AlertTriangle, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getAuditReviewSignals, type AuditReviewSignalLevel } from "@/pages/audit-logs/audit-log-review-signals";
import type { AuditLogRecord } from "@/pages/audit-logs/types";

type AuditLogReviewSignalsProps = {
  compact?: boolean;
  log: AuditLogRecord;
};

const signalClassNames: Record<AuditReviewSignalLevel, string> = {
  critical: "border-red-200 bg-red-50 text-red-900 dark:border-red-900/70 dark:bg-red-950/35 dark:text-red-200",
  attention: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/35 dark:text-amber-200",
  watch: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/70 dark:bg-sky-950/35 dark:text-sky-200",
};

export function AuditLogReviewSignals({ compact = false, log }: AuditLogReviewSignalsProps) {
  const signals = getAuditReviewSignals(log);
  if (signals.length === 0) return null;

  if (compact) {
    return (
      <>
        {signals.slice(0, 2).map((signal) => {
          const Icon = signal.level === "watch" ? Eye : AlertTriangle;
          return (
            <Badge
              key={signal.code}
              variant="outline"
              className={cn("gap-1.5 border py-1", signalClassNames[signal.level])}
              title={signal.description}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {signal.label}
            </Badge>
          );
        })}
      </>
    );
  }

  return (
    <section
      className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/25 dark:text-amber-100"
      aria-labelledby="audit-review-signals-title"
    >
      <h3
        id="audit-review-signals-title"
        className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em]"
      >
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        Review Signals
      </h3>
      <div className="mt-3 grid gap-2">
        {signals.map((signal) => (
          <div key={signal.code} className="rounded-lg border border-current/15 bg-background/60 p-3">
            <p className="text-sm font-semibold">{signal.label}</p>
            <p className="mt-1 text-sm leading-relaxed opacity-85">{signal.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}


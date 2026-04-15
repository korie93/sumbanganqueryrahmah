import { Suspense } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  getMonitorSummaryToneClass,
  MonitorWebVitalsInlineFallback,
} from "@/components/monitor/MonitorDeferredSection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { lazyWithPreload } from "@/lib/lazy-with-preload";
import { useMonitorPageContext } from "@/pages/monitor/MonitorPageContext";

const MonitorWebVitalsSection = lazyWithPreload(() =>
  import("@/components/monitor/MonitorWebVitalsSection").then((module) => ({
    default: module.MonitorWebVitalsSection,
  })),
);

export function MonitorPageWebVitalsSection() {
  const {
    webVitalsCompactSummary,
    webVitalsSummaryFacts,
    webVitalsSummaryLabel,
    webVitalsOpen,
    handleWebVitalsToggle,
    webVitalsOverview,
  } = useMonitorPageContext();

  return (
    <section className="glass-wrapper p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700 dark:text-sky-300">
            Real User Experience
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={`rounded-full px-3 py-1 text-xs ${getMonitorSummaryToneClass(webVitalsCompactSummary.tone)}`}
            >
              {webVitalsCompactSummary.badge}
            </Badge>
            {webVitalsSummaryFacts.map((fact) => (
              <Badge
                key={fact.label}
                variant="outline"
                className={`rounded-full px-3 py-1 text-xs ${getMonitorSummaryToneClass(fact.tone)}`}
              >
                {fact.label} {fact.value}
              </Badge>
            ))}
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
              {webVitalsCompactSummary.headline}
            </h2>
            <p className="max-w-3xl text-sm text-muted-foreground">{webVitalsSummaryLabel}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {webVitalsOpen ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full px-4"
              aria-expanded="true"
              onClick={handleWebVitalsToggle}
            >
              Hide information
              <ChevronUp className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full px-4"
              aria-expanded="false"
              onClick={handleWebVitalsToggle}
            >
              Information
              <ChevronDown className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {webVitalsOpen ? (
        <div className="mt-6">
          <Suspense fallback={<MonitorWebVitalsInlineFallback />}>
            <MonitorWebVitalsSection overview={webVitalsOverview} embedded />
          </Suspense>
        </div>
      ) : null}
    </section>
  );
}

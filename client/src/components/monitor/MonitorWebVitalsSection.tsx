import { memo, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  buildMonitorWebVitalPrimaryMetricBadges,
  resolveMonitorWebVitalOpenPageTypes,
} from "@/components/monitor/monitor-web-vitals-utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { WebVitalMetricSummary, WebVitalOverviewPayload, WebVitalPageSummary } from "@shared/web-vitals";

const PRIMARY_METRICS = ["LCP", "INP", "CLS"] as const;
const SECONDARY_METRICS = ["FCP", "TTFB"] as const;

function formatWebVitalValue(name: WebVitalMetricSummary["name"], value: number | null) {
  if (value === null) {
    return "--";
  }

  if (name === "CLS") {
    return value.toFixed(3);
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}s`;
  }

  return `${Math.round(value)}ms`;
}

function getRatingBadgeClass(rating: WebVitalMetricSummary["p75Rating"] | WebVitalMetricSummary["latestRating"]) {
  if (rating === "good") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }

  if (rating === "needs-improvement") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }

  if (rating === "poor") {
    return "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300";
  }

  return "border-border/60 bg-background/60 text-muted-foreground";
}

function formatLastCaptured(timestamp: string | null) {
  if (!timestamp) {
    return "No recent samples";
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "No recent samples";
  }

  return `Updated ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function getPageSummaryLabel(pageType: WebVitalPageSummary["pageType"]) {
  return pageType === "public" ? "Public Surface" : "Authenticated App";
}

function getMetric(summary: WebVitalPageSummary, name: WebVitalMetricSummary["name"]) {
  return summary.metrics.find((metric) => metric.name === name) ?? null;
}

function arraysEqual<T>(left: T[], right: T[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function MonitorWebVitalsSectionImpl({
  overview,
  embedded = false,
}: {
  overview: WebVitalOverviewPayload;
  embedded?: boolean;
}) {
  const [openPageTypes, setOpenPageTypes] = useState<WebVitalPageSummary["pageType"][]>(() => {
    const firstPageType = overview.pageSummaries[0]?.pageType;
    return firstPageType ? [firstPageType] : [];
  });

  const pageSummaries = useMemo(() => overview.pageSummaries, [overview.pageSummaries]);

  useEffect(() => {
    const availablePageTypes = pageSummaries.map((summary) => summary.pageType);

    setOpenPageTypes((previous) => {
      const next = resolveMonitorWebVitalOpenPageTypes(availablePageTypes, previous);
      return arraysEqual(previous, next) ? previous : next;
    });
  }, [pageSummaries]);

  return (
    <section className={cn(embedded ? "space-y-0" : "glass-wrapper p-4 sm:p-6")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700 dark:text-sky-300">
            Real User Experience
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
              Recent Web Vitals from real sessions
            </h2>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Rolling {overview.windowMinutes}-minute view from browser telemetry, grouped into public and authenticated experiences.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
            {overview.totalSamples} samples
          </Badge>
          <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">
            {formatLastCaptured(overview.updatedAt)}
          </Badge>
        </div>
      </div>

      {overview.totalSamples === 0 ? (
        <Card className="mt-6 border-dashed border-border/60 bg-background/35">
          <CardContent className="p-5 text-sm text-muted-foreground">
            Web Vitals data will appear here after real browser sessions send telemetry. This overview stays lightweight and uses a rolling in-memory window only.
          </CardContent>
        </Card>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
          {pageSummaries.map((summary) => {
            const isOpen = openPageTypes.includes(summary.pageType);
            const compactMetricBadges = buildMonitorWebVitalPrimaryMetricBadges(summary);

            return (
              <Card key={summary.pageType} className="border-border/60 bg-background/45">
                <CardHeader className="space-y-3 pb-3">
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-3 text-left"
                    onClick={() =>
                      setOpenPageTypes((previous) =>
                        previous.includes(summary.pageType)
                          ? previous.filter((pageType) => pageType !== summary.pageType)
                          : [...previous, summary.pageType],
                      )
                    }
                    aria-expanded={isOpen ? "true" : "false"}
                  >
                    <div className="min-w-0 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-base font-semibold text-foreground">
                          {getPageSummaryLabel(summary.pageType)}
                        </CardTitle>
                        <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px] uppercase tracking-wide">
                          {summary.sampleCount} samples
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{formatLastCaptured(summary.latestCapturedAt)}</p>
                      <div className="flex flex-wrap gap-2">
                        {compactMetricBadges.map((metric) => (
                          <Badge
                            key={`${summary.pageType}-${metric.name}`}
                            variant="outline"
                            className={`rounded-full px-3 py-1 text-xs ${getRatingBadgeClass(metric.p75Rating)}`}
                          >
                            {metric.name} {formatWebVitalValue(metric.name, metric.p75)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <span className="shrink-0 pt-1 text-muted-foreground">
                      {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </span>
                  </button>
                </CardHeader>
                {isOpen ? (
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      {PRIMARY_METRICS.map((metricName) => {
                        const metric = getMetric(summary, metricName);
                        return (
                          <div
                            key={metricName}
                            className="rounded-2xl border border-border/60 bg-background/55 p-3"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                                {metricName}
                              </p>
                              <Badge
                                variant="outline"
                                className={`rounded-full px-2 py-0.5 text-[10px] ${getRatingBadgeClass(metric?.p75Rating ?? null)}`}
                              >
                                {metric?.p75Rating ?? "pending"}
                              </Badge>
                            </div>
                            <p className="mt-3 text-2xl font-semibold text-foreground">
                              {formatWebVitalValue(metricName, metric?.p75 ?? null)}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              p75 from {metric?.sampleCount ?? 0} samples
                            </p>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {SECONDARY_METRICS.map((metricName) => {
                        const metric = getMetric(summary, metricName);
                        return (
                          <Badge
                            key={metricName}
                            variant="outline"
                            className={`rounded-full px-3 py-1 text-xs ${getRatingBadgeClass(metric?.p75Rating ?? null)}`}
                          >
                            {metricName} {formatWebVitalValue(metricName, metric?.p75 ?? null)}
                          </Badge>
                        );
                      })}
                    </div>

                    {summary.metrics.some((metric) => metric.latestPath) ? (
                      <div className="rounded-2xl border border-border/60 bg-background/45 p-3 text-xs text-muted-foreground">
                        {summary.metrics
                          .filter((metric) => metric.latestPath)
                          .slice(0, 2)
                          .map((metric) => (
                            <p key={`${summary.pageType}-${metric.name}`}>
                              Latest {metric.name} path: <span className="font-medium text-foreground">{metric.latestPath}</span>
                            </p>
                          ))}
                      </div>
                    ) : null}
                  </CardContent>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}

export const MonitorWebVitalsSection = memo(MonitorWebVitalsSectionImpl);

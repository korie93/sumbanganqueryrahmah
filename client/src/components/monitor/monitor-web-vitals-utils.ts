import type { WebVitalOverviewPayload, WebVitalPageSummary } from "@shared/web-vitals";

const PRIMARY_WEB_VITALS = ["LCP", "INP", "CLS"] as const;

export type MonitorWebVitalSummaryTone = "stable" | "watch" | "attention";

export type MonitorWebVitalSummaryFact = {
  label: string;
  value: string;
  tone: MonitorWebVitalSummaryTone;
};

export function resolveMonitorWebVitalOpenPageTypes(
  availablePageTypes: WebVitalPageSummary["pageType"][],
  previousOpenPageTypes: WebVitalPageSummary["pageType"][],
) {
  const available = new Set(availablePageTypes);
  const next: WebVitalPageSummary["pageType"][] = [];

  for (const pageType of previousOpenPageTypes) {
    if (!available.has(pageType) || next.includes(pageType)) {
      continue;
    }

    next.push(pageType);
  }

  return next;
}

export function buildMonitorWebVitalPrimaryMetricBadges(summary: WebVitalPageSummary) {
  return PRIMARY_WEB_VITALS.map((name) => {
    const metric = summary.metrics.find((item) => item.name === name) ?? null;

    return {
      name,
      p75: metric?.p75 ?? null,
      p75Rating: metric?.p75Rating ?? null,
    };
  });
}

function collectPrimaryMetricRatings(overview: WebVitalOverviewPayload) {
  return overview.pageSummaries.flatMap((summary) =>
    PRIMARY_WEB_VITALS.map((name) => summary.metrics.find((metric) => metric.name === name) ?? null).filter(
      (metric): metric is NonNullable<(typeof summary.metrics)[number]> => metric !== null,
    ),
  );
}

export function buildMonitorWebVitalCompactSummary(overview: WebVitalOverviewPayload) {
  if (overview.totalSamples === 0) {
    return {
      tone: "watch" as const,
      badge: "Waiting",
      headline: "Recent browser telemetry has not arrived yet.",
      description: `The current ${overview.windowMinutes}-minute window is still waiting for real session samples.`,
    };
  }

  const primaryMetrics = collectPrimaryMetricRatings(overview);
  const poorCount = primaryMetrics.filter((metric) => metric.p75Rating === "poor").length;
  const watchCount = primaryMetrics.filter((metric) => metric.p75Rating === "needs-improvement").length;
  const surfacesWithSamples = overview.pageSummaries.filter((summary) => summary.sampleCount > 0).length;

  if (poorCount > 0) {
    return {
      tone: "attention" as const,
      badge: "Attention",
      headline: "Recent sessions show degraded browser experience.",
      description: `${poorCount} primary vital${poorCount === 1 ? " is" : "s are"} in the poor range across ${surfacesWithSamples} monitored surface${surfacesWithSamples === 1 ? "" : "s"}.`,
    };
  }

  if (watchCount > 0) {
    return {
      tone: "watch" as const,
      badge: "Watch",
      headline: "Recent sessions are visible, with a few vitals worth watching.",
      description: `${watchCount} primary vital${watchCount === 1 ? "" : "s"} need improvement across ${surfacesWithSamples} monitored surface${surfacesWithSamples === 1 ? "" : "s"}.`,
    };
  }

  return {
    tone: "stable" as const,
    badge: "Healthy",
    headline: "Recent sessions are staying within current vitals thresholds.",
    description: `${overview.totalSamples} recent sample${overview.totalSamples === 1 ? "" : "s"} are tracking cleanly across ${surfacesWithSamples} monitored surface${surfacesWithSamples === 1 ? "" : "s"}.`,
  };
}

export function buildMonitorWebVitalSummaryFacts(overview: WebVitalOverviewPayload): MonitorWebVitalSummaryFact[] {
  const surfacesWithSamples = overview.pageSummaries.filter((summary) => summary.sampleCount > 0).length;
  const primaryMetrics = collectPrimaryMetricRatings(overview);
  const poorCount = primaryMetrics.filter((metric) => metric.p75Rating === "poor").length;
  const watchCount = primaryMetrics.filter((metric) => metric.p75Rating === "needs-improvement").length;

  const facts: MonitorWebVitalSummaryFact[] = [
    {
      label: "Samples",
      value: String(overview.totalSamples),
      tone: overview.totalSamples > 0 ? "stable" : "watch",
    },
    {
      label: "Surfaces",
      value: String(surfacesWithSamples),
      tone: surfacesWithSamples > 0 ? "stable" : "watch",
    },
  ];

  if (poorCount > 0) {
    facts.push({
      label: "Poor",
      value: String(poorCount),
      tone: "attention",
    });
    return facts;
  }

  if (watchCount > 0) {
    facts.push({
      label: "Watch",
      value: String(watchCount),
      tone: "watch",
    });
    return facts;
  }

  if (overview.totalSamples > 0) {
    facts.push({
      label: "Healthy",
      value: String(primaryMetrics.length),
      tone: "stable",
    });
  }

  return facts;
}

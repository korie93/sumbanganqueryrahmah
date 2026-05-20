export type InternalMetricName =
  | "collectionPiiDecryptFallbackTotal"
  | "cspReportsAcceptedTotal"
  | "cspReportsDroppedRateLimitTotal"
  | "cspReportsDroppedRequestGuardTotal"
  | "cspReportsDroppedTotal"
  | "webVitalsAcceptedTotal"
  | "webVitalsDroppedRateLimitTotal"
  | "webVitalsDroppedRequestGuardTotal"
  | "webVitalsDroppedTotal"
  | "webVitalsLegacyRouteGoneTotal"
  | "webVitalsLegacyRouteUsedTotal";

export type InternalMetricsRecorder = {
  increment: (name: InternalMetricName, amount?: number) => void;
  snapshot: () => {
    counters: Record<InternalMetricName, number>;
    timestamp: string;
  };
};

const INTERNAL_METRIC_NAMES: readonly InternalMetricName[] = [
  "collectionPiiDecryptFallbackTotal",
  "cspReportsAcceptedTotal",
  "cspReportsDroppedRateLimitTotal",
  "cspReportsDroppedRequestGuardTotal",
  "cspReportsDroppedTotal",
  "webVitalsAcceptedTotal",
  "webVitalsDroppedRateLimitTotal",
  "webVitalsDroppedRequestGuardTotal",
  "webVitalsDroppedTotal",
  "webVitalsLegacyRouteGoneTotal",
  "webVitalsLegacyRouteUsedTotal",
];

export function createInternalMetrics(): InternalMetricsRecorder {
  const counters = new Map<InternalMetricName, number>(
    INTERNAL_METRIC_NAMES.map((name) => [name, 0]),
  );

  return {
    increment(name, amount = 1) {
      const normalizedAmount = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
      if (normalizedAmount === 0) {
        return;
      }

      counters.set(name, (counters.get(name) ?? 0) + normalizedAmount);
    },
    snapshot() {
      return {
        counters: Object.fromEntries(
          INTERNAL_METRIC_NAMES.map((name) => [name, counters.get(name) ?? 0]),
        ) as Record<InternalMetricName, number>,
        timestamp: new Date().toISOString(),
      };
    },
  };
}

export const internalMetrics = createInternalMetrics();

export function getInternalMetricsSnapshot(
  metrics: InternalMetricsRecorder = internalMetrics,
) {
  return metrics.snapshot();
}

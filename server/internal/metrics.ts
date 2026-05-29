export type InternalMetricName =
  | "authAdaptiveRateLimitCooldownCachePressureTotal"
  | "authAdaptiveRateLimitCooldownEvictionsTotal"
  | "authIdentityFallbackTotal"
  | "authTabVisibilityCacheEvictionsTotal"
  | "authTabVisibilityCacheExpiredEntriesTotal"
  | "collectionPiiDecryptFallbackTotal"
  | "collectionRollupNotificationCallbackFailuresTotal"
  | "collectionRollupNotificationCriticalFailuresTotal"
  | "collectionRollupNotificationDisconnectFailuresTotal"
  | "collectionRollupNotificationListenerRemovalFailuresTotal"
  | "collectionRollupNotificationReconnectFailuresTotal"
  | "cspReportsAcceptedTotal"
  | "cspReportsDroppedRateLimitTotal"
  | "cspReportsDroppedRequestGuardTotal"
  | "cspReportsDroppedTotal"
  | "idempotencyFingerprintSweepErrorsTotal"
  | "jsonParseFailuresTotal"
  | "redisRateLimitEvalTypeErrorsTotal"
  | "sessionRefreshRevocationRetryAttemptsTotal"
  | "sessionRefreshRevocationRetryExhaustedTotal"
  | "sessionRevocationRedisErrorsTotal"
  | "webVitalsAcceptedTotal"
  | "webVitalsDroppedRateLimitTotal"
  | "webVitalsDroppedRequestGuardTotal"
  | "webVitalsDroppedTotal"
  | "webVitalsLegacyRouteGoneTotal"
  | "webVitalsLegacyRouteUsedTotal";

export type InternalGaugeName =
  | "authTabVisibilityCacheSize"
  | "authTabVisibilityCacheUtilization";

export type InternalMetricsRecorder = {
  gauge: (name: InternalGaugeName, value: number) => void;
  increment: (name: InternalMetricName, amount?: number) => void;
  snapshot: () => {
    counters: Record<InternalMetricName, number>;
    gauges: Record<InternalGaugeName, number>;
    timestamp: string;
  };
};

const INTERNAL_METRIC_NAMES: readonly InternalMetricName[] = [
  "authAdaptiveRateLimitCooldownCachePressureTotal",
  "authAdaptiveRateLimitCooldownEvictionsTotal",
  "authIdentityFallbackTotal",
  "authTabVisibilityCacheEvictionsTotal",
  "authTabVisibilityCacheExpiredEntriesTotal",
  "collectionPiiDecryptFallbackTotal",
  "collectionRollupNotificationCallbackFailuresTotal",
  "collectionRollupNotificationCriticalFailuresTotal",
  "collectionRollupNotificationDisconnectFailuresTotal",
  "collectionRollupNotificationListenerRemovalFailuresTotal",
  "collectionRollupNotificationReconnectFailuresTotal",
  "cspReportsAcceptedTotal",
  "cspReportsDroppedRateLimitTotal",
  "cspReportsDroppedRequestGuardTotal",
  "cspReportsDroppedTotal",
  "idempotencyFingerprintSweepErrorsTotal",
  "jsonParseFailuresTotal",
  "redisRateLimitEvalTypeErrorsTotal",
  "sessionRefreshRevocationRetryAttemptsTotal",
  "sessionRefreshRevocationRetryExhaustedTotal",
  "sessionRevocationRedisErrorsTotal",
  "webVitalsAcceptedTotal",
  "webVitalsDroppedRateLimitTotal",
  "webVitalsDroppedRequestGuardTotal",
  "webVitalsDroppedTotal",
  "webVitalsLegacyRouteGoneTotal",
  "webVitalsLegacyRouteUsedTotal",
];

const INTERNAL_GAUGE_NAMES: readonly InternalGaugeName[] = [
  "authTabVisibilityCacheSize",
  "authTabVisibilityCacheUtilization",
];

export function createInternalMetrics(): InternalMetricsRecorder {
  const counters = new Map<InternalMetricName, number>(
    INTERNAL_METRIC_NAMES.map((name) => [name, 0]),
  );
  const gauges = new Map<InternalGaugeName, number>(
    INTERNAL_GAUGE_NAMES.map((name) => [name, 0]),
  );

  return {
    gauge(name, value) {
      gauges.set(name, Number.isFinite(value) ? value : 0);
    },
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
        gauges: Object.fromEntries(
          INTERNAL_GAUGE_NAMES.map((name) => [name, gauges.get(name) ?? 0]),
        ) as Record<InternalGaugeName, number>,
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

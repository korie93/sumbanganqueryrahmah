export type InternalMetricName =
  | "apiResponseSensitiveFieldsStrippedTotal"
  | "authAdaptiveRateLimitCooldownCacheNearCapacityAlertsTotal"
  | "authAdaptiveRateLimitCooldownCachePressureTotal"
  | "authAdaptiveRateLimitCooldownEvictionsTotal"
  | "authIdentityFallbackTotal"
  | "authTabVisibilityCacheEvictionsTotal"
  | "authTabVisibilityCacheExpiredEntriesTotal"
  | "backupPayloadIntegrityFailuresTotal"
  | "collectionPiiDecryptFallbackTotal"
  | "collectionPiiDecryptFailClosedTotal"
  | "collectionReceiptExternalScanArgValidationFailuresTotal"
  | "collectionReceiptExternalScanFailOpenBypassTotal"
  | "collectionReceiptExternalScanFailuresTotal"
  | "collectionReceiptPathTraversalBlockedTotal"
  | "collectionRollupNotificationCallbackFailuresTotal"
  | "collectionRollupNotificationCriticalFailuresTotal"
  | "collectionRollupNotificationDisconnectFailuresTotal"
  | "collectionRollupNotificationListenerRemovalFailuresTotal"
  | "collectionRollupNotificationReconnectFailuresTotal"
  | "cspReportsAcceptedTotal"
  | "cspReportsDroppedRateLimitTotal"
  | "cspReportsDroppedRequestGuardTotal"
  | "cspReportsDroppedTotal"
  | "dbDeadlocksTotal"
  | "dbHealthCheckCircuitBreaksTotal"
  | "dbHealthCheckFailuresTotal"
  | "dbHealthCheckRecoveryAttemptsTotal"
  | "dbHealthCheckRecoverySuccessTotal"
  | "dbHealthCheckSkippedConcurrentTotal"
  | "idempotencyFingerprintSweepErrorsTotal"
  | "jsonParseFailuresTotal"
  | "redisRateLimitEvalTypeErrorsTotal"
  | "sessionRefreshDedupedTotal"
  | "sessionRefreshRevocationRetryAttemptsTotal"
  | "sessionRefreshRevocationRetryExhaustedTotal"
  | "sessionRevocationRedisErrorsTotal"
  | "twoFactorTotpSha1VerificationSuccessTotal"
  | "webVitalsAcceptedTotal"
  | "webVitalsDroppedRateLimitTotal"
  | "webVitalsDroppedRequestGuardTotal"
  | "webVitalsDroppedTotal"
  | "webVitalsLegacyRouteGoneTotal"
  | "webVitalsLegacyRouteUsedTotal"
  | "webSocketOversizedMessagesTotal"
  | "webSocketPayloadWindowExceededTotal";

export type InternalGaugeName =
  | "authAdaptiveRateLimitCooldownCacheSize"
  | "authAdaptiveRateLimitCooldownCacheUtilization"
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
  "apiResponseSensitiveFieldsStrippedTotal",
  "authAdaptiveRateLimitCooldownCacheNearCapacityAlertsTotal",
  "authAdaptiveRateLimitCooldownCachePressureTotal",
  "authAdaptiveRateLimitCooldownEvictionsTotal",
  "authIdentityFallbackTotal",
  "authTabVisibilityCacheEvictionsTotal",
  "authTabVisibilityCacheExpiredEntriesTotal",
  "backupPayloadIntegrityFailuresTotal",
  "collectionPiiDecryptFallbackTotal",
  "collectionPiiDecryptFailClosedTotal",
  "collectionReceiptExternalScanArgValidationFailuresTotal",
  "collectionReceiptExternalScanFailOpenBypassTotal",
  "collectionReceiptExternalScanFailuresTotal",
  "collectionReceiptPathTraversalBlockedTotal",
  "collectionRollupNotificationCallbackFailuresTotal",
  "collectionRollupNotificationCriticalFailuresTotal",
  "collectionRollupNotificationDisconnectFailuresTotal",
  "collectionRollupNotificationListenerRemovalFailuresTotal",
  "collectionRollupNotificationReconnectFailuresTotal",
  "cspReportsAcceptedTotal",
  "cspReportsDroppedRateLimitTotal",
  "cspReportsDroppedRequestGuardTotal",
  "cspReportsDroppedTotal",
  "dbDeadlocksTotal",
  "dbHealthCheckCircuitBreaksTotal",
  "dbHealthCheckFailuresTotal",
  "dbHealthCheckRecoveryAttemptsTotal",
  "dbHealthCheckRecoverySuccessTotal",
  "dbHealthCheckSkippedConcurrentTotal",
  "idempotencyFingerprintSweepErrorsTotal",
  "jsonParseFailuresTotal",
  "redisRateLimitEvalTypeErrorsTotal",
  "sessionRefreshDedupedTotal",
  "sessionRefreshRevocationRetryAttemptsTotal",
  "sessionRefreshRevocationRetryExhaustedTotal",
  "sessionRevocationRedisErrorsTotal",
  "twoFactorTotpSha1VerificationSuccessTotal",
  "webVitalsAcceptedTotal",
  "webVitalsDroppedRateLimitTotal",
  "webVitalsDroppedRequestGuardTotal",
  "webVitalsDroppedTotal",
  "webVitalsLegacyRouteGoneTotal",
  "webVitalsLegacyRouteUsedTotal",
  "webSocketOversizedMessagesTotal",
  "webSocketPayloadWindowExceededTotal",
];

const INTERNAL_GAUGE_NAMES: readonly InternalGaugeName[] = [
  "authAdaptiveRateLimitCooldownCacheSize",
  "authAdaptiveRateLimitCooldownCacheUtilization",
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

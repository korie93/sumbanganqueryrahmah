import type {
  InternalMonitorAlert,
  InternalMonitorSnapshot,
} from "./runtime-monitor-types";

export function buildInternalMonitorAlerts(snapshot: InternalMonitorSnapshot): InternalMonitorAlert[] {
  const alerts: InternalMonitorAlert[] = [];
  const timestamp = new Date(snapshot.updatedAt || Date.now()).toISOString();

  const pushAlert = (
    severity: InternalMonitorAlert["severity"],
    source: string,
    message: string,
  ) => {
    alerts.push({
      id: `${source.toLowerCase().replace(/[^a-z0-9_]/g, "_")}_${severity.toLowerCase()}`,
      severity,
      source,
      message,
      timestamp,
    });
  };

  if (snapshot.mode === "PROTECTION") {
    pushAlert("CRITICAL", "MODE", "System is in PROTECTION mode. Heavy routes are restricted.");
  } else if (snapshot.mode === "DEGRADED") {
    pushAlert("WARNING", "MODE", "System is in DEGRADED mode. Throughput throttling is active.");
  }

  if (snapshot.cpuPercent >= 88) {
    pushAlert("CRITICAL", "CPU", `CPU usage is critically high at ${snapshot.cpuPercent.toFixed(1)}%.`);
  } else if (snapshot.cpuPercent >= 75) {
    pushAlert("WARNING", "CPU", `CPU usage is elevated at ${snapshot.cpuPercent.toFixed(1)}%.`);
  }

  if (snapshot.ramPercent >= 92) {
    pushAlert("CRITICAL", "RAM", `RAM usage is critically high at ${snapshot.ramPercent.toFixed(1)}%.`);
  } else if (snapshot.ramPercent >= 80) {
    pushAlert("WARNING", "RAM", `RAM usage is elevated at ${snapshot.ramPercent.toFixed(1)}%.`);
  }

  if (snapshot.dbLatencyMs >= 1000) {
    pushAlert("CRITICAL", "DB", `Database latency is critical (${snapshot.dbLatencyMs.toFixed(0)} ms).`);
  } else if (snapshot.dbLatencyMs >= 400) {
    pushAlert("WARNING", "DB", `Database latency is elevated (${snapshot.dbLatencyMs.toFixed(0)} ms).`);
  }

  if (snapshot.aiLatencyMs >= 1400) {
    pushAlert("CRITICAL", "AI", `AI latency is critical (${snapshot.aiLatencyMs.toFixed(0)} ms).`);
  } else if (snapshot.aiLatencyMs >= 700) {
    pushAlert("WARNING", "AI", `AI latency is elevated (${snapshot.aiLatencyMs.toFixed(0)} ms).`);
  }

  if (snapshot.eventLoopLagMs >= 170) {
    pushAlert("CRITICAL", "EVENT_LOOP", `Event loop lag is critical (${snapshot.eventLoopLagMs.toFixed(1)} ms).`);
  } else if (snapshot.eventLoopLagMs >= 90) {
    pushAlert("WARNING", "EVENT_LOOP", `Event loop lag is elevated (${snapshot.eventLoopLagMs.toFixed(1)} ms).`);
  }

  if (snapshot.errorRate >= 5) {
    pushAlert("CRITICAL", "ERRORS", `Runtime failure rate is high (${snapshot.errorRate.toFixed(2)}%).`);
  } else if (snapshot.errorRate >= 2) {
    pushAlert("WARNING", "ERRORS", `Runtime failure rate is elevated (${snapshot.errorRate.toFixed(2)}%).`);
  }

  if (snapshot.status429Count >= 40) {
    pushAlert("CRITICAL", "RATE_LIMIT", `High rate-limit pressure detected (${snapshot.status429Count} x 429 in 5s).`);
  } else if (snapshot.status429Count >= 15) {
    pushAlert("WARNING", "RATE_LIMIT", `Elevated rate-limit pressure (${snapshot.status429Count} x 429 in 5s).`);
  }

  if (snapshot.status401Count + snapshot.status403Count >= 40) {
    pushAlert(
      "WARNING",
      "AUTH",
      `Authentication/authorization spikes detected (401=${snapshot.status401Count}, 403=${snapshot.status403Count} in 5s).`,
    );
  }

  if (snapshot.localOpenCircuitCount > 0 || snapshot.clusterOpenCircuitCount > 0) {
    pushAlert(
      snapshot.localOpenCircuitCount > 0 ? "CRITICAL" : "WARNING",
      "CIRCUITS",
      `Circuit protection is active (local open=${snapshot.localOpenCircuitCount}, cluster open=${snapshot.clusterOpenCircuitCount}).`,
    );
  }

  if (snapshot.queueLength >= 10) {
    pushAlert("CRITICAL", "QUEUE", `Request queue is saturated (${snapshot.queueLength} pending).`);
  } else if (snapshot.queueLength >= 5) {
    pushAlert("WARNING", "QUEUE", `Request queue is growing (${snapshot.queueLength} pending).`);
  }

  if (snapshot.rollupRefreshPendingCount >= 30) {
    pushAlert(
      "CRITICAL",
      "ROLLUP_QUEUE",
      `Collection rollup refresh backlog is saturated (${snapshot.rollupRefreshPendingCount} pending slices).`,
    );
  } else if (snapshot.rollupRefreshPendingCount >= 10) {
    pushAlert(
      "WARNING",
      "ROLLUP_QUEUE",
      `Collection rollup refresh backlog is growing (${snapshot.rollupRefreshPendingCount} pending slices).`,
    );
  }

  if (snapshot.rollupRefreshOldestPendingAgeMs >= 5 * 60 * 1000) {
    pushAlert(
      "CRITICAL",
      "ROLLUP_LAG",
      `Collection rollup refresh lag is critical (${snapshot.rollupRefreshOldestPendingAgeMs.toFixed(0)} ms oldest pending).`,
    );
  } else if (snapshot.rollupRefreshOldestPendingAgeMs >= 60 * 1000) {
    pushAlert(
      "WARNING",
      "ROLLUP_LAG",
      `Collection rollup refresh lag is elevated (${snapshot.rollupRefreshOldestPendingAgeMs.toFixed(0)} ms oldest pending).`,
    );
  }

  if (snapshot.rollupRefreshRetryCount >= 5) {
    pushAlert(
      "CRITICAL",
      "ROLLUP_RETRY",
      `Collection rollup refresh retries are accumulating (${snapshot.rollupRefreshRetryCount} slices need retry).`,
    );
  } else if (snapshot.rollupRefreshRetryCount >= 1) {
    pushAlert(
      "WARNING",
      "ROLLUP_RETRY",
      `Collection rollup refresh encountered retryable failures (${snapshot.rollupRefreshRetryCount} slices pending retry).`,
    );
  }

  if (snapshot.workerCount >= snapshot.maxWorkers && snapshot.maxWorkers > 0) {
    pushAlert("WARNING", "WORKERS", `Worker capacity reached (${snapshot.workerCount}/${snapshot.maxWorkers}).`);
  }

  return alerts;
}

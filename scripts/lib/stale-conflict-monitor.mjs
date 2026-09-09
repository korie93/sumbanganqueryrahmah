import fs from "node:fs/promises";
import path from "node:path";

function countAlertSeverities(alertsPayload) {
  const rows = Array.isArray(alertsPayload?.alerts) ? alertsPayload.alerts : [];
  let critical = 0;
  let warning = 0;
  for (const row of rows) {
    const severity = String(row?.severity || "").toUpperCase();
    if (severity === "CRITICAL") critical += 1;
    else if (severity === "WARNING") warning += 1;
  }
  return { critical, warning };
}

function formatMonitorStatus(metrics) {
  const staleConflicts = Number(metrics.summary?.collectionRecordVersionConflicts24h || 0);
  const loginFailures = Number(metrics.summary?.loginFailures24h || 0);
  const backupActions = Number(metrics.summary?.backupActions24h || 0);
  const status429Count = Number(metrics.system?.status429Count || 0);
  const errorRate = Number(metrics.system?.errorRate || 0);
  const activeAlertCount = Number(metrics.system?.activeAlertCount || 0);
  const criticalAlerts = Number(metrics.alerts?.critical || 0);
  const warningAlerts = Number(metrics.alerts?.warning || 0);

  const warnings = [];
  if (staleConflicts >= 20) warnings.push("stale_conflicts_high");
  if (loginFailures >= 25) warnings.push("login_failures_high");
  if (status429Count >= 30) warnings.push("rate_limit_pressure_high");
  if (errorRate >= 0.05) warnings.push("error_rate_high");
  if (criticalAlerts >= 1) warnings.push("runtime_alerts_critical");
  if (warningAlerts >= 1) warnings.push("runtime_alerts_warning");

  return {
    staleConflicts24h: staleConflicts,
    loginFailures24h: loginFailures,
    backupActions24h: backupActions,
    status429Count5s: status429Count,
    errorRate,
    activeAlertCount,
    criticalAlerts,
    warningAlerts,
    warnings,
  };
}

// The caller owns authentication and logout. Reuse its in-memory HTTP client;
// neither session cookies nor credentials belong in the snapshot artifact.
export async function captureStaleConflictSnapshot({ request, baseUrl, outputFile = "" }) {
  const [summaryResponse, systemResponse, alertsResponse] = await Promise.all([
    request("/api/analytics/summary"),
    request("/internal/system-health", {}, { allowFailure: true }),
    request("/internal/alerts", {}, { allowFailure: true }),
  ]);

  const summary = summaryResponse.json || {};
  const system = systemResponse.status === 200 ? systemResponse.json : null;
  const alertCounts = alertsResponse.status === 200
    ? countAlertSeverities(alertsResponse.json)
    : { critical: 0, warning: 0 };
  const status = formatMonitorStatus({ summary, system, alerts: alertCounts });

  const payload = {
    timestamp: new Date().toISOString(),
    baseUrl,
    summary: {
      collectionRecordVersionConflicts24h: Number(summary.collectionRecordVersionConflicts24h || 0),
      loginFailures24h: Number(summary.loginFailures24h || 0),
      backupActions24h: Number(summary.backupActions24h || 0),
      activeSessions: Number(summary.activeSessions || 0),
    },
    system: system
      ? {
          status429Count: Number(system.status429Count || 0),
          errorRate: Number(system.errorRate || 0),
          activeAlertCount: Number(system.activeAlertCount || 0),
        }
      : {
          status429Count: null,
          errorRate: null,
          activeAlertCount: null,
          note: "internal/system-health unavailable for current role/tab access",
        },
    alerts: alertsResponse.status === 200
      ? { critical: alertCounts.critical, warning: alertCounts.warning }
      : {
          critical: null,
          warning: null,
          note: "internal/alerts unavailable for current role/tab access",
        },
    status,
  };

  if (outputFile) {
    await fs.mkdir(path.dirname(outputFile), { recursive: true });
    await fs.writeFile(outputFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }
  return payload;
}

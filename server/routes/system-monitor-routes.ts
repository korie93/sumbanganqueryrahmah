import type { SystemRouteContext } from "./system-route-context";

export function registerSystemMonitorRoutes(context: SystemRouteContext) {
  const {
    app,
    authenticateToken,
    requireRole,
    requireMonitorAccess,
    computeInternalMonitorSnapshot,
    buildInternalMonitorAlerts,
    getControlState,
    getDbProtection,
    getRequestRate,
    getLatencyP95,
    getLocalCircuitSnapshots,
    getIntelligenceExplainability,
    getWebVitalsOverview,
  } = context;

  app.get(
    "/internal/system-health",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireMonitorAccess,
    (_req, res) => {
      const snapshot = computeInternalMonitorSnapshot();
      const alerts = buildInternalMonitorAlerts(snapshot);
      res.json({
        ...snapshot,
        activeAlertCount: alerts.length,
      });
    },
  );

  app.get(
    "/internal/system-mode",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireMonitorAccess,
    (_req, res) => {
      const controlState = getControlState();
      res.json({
        mode: controlState.mode,
        throttleFactor: controlState.throttleFactor,
        rejectHeavyRoutes: controlState.rejectHeavyRoutes,
        dbProtection: getDbProtection(),
        preAllocatedMB: controlState.preAllocateMB,
        updatedAt: controlState.updatedAt,
      });
    },
  );

  app.get(
    "/internal/workers",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireMonitorAccess,
    (_req, res) => {
      const controlState = getControlState();
      res.json({
        count: controlState.workerCount,
        maxWorkers: controlState.maxWorkers,
        workers: controlState.workers,
        updatedAt: controlState.updatedAt,
      });
    },
  );

  app.get(
    "/internal/web-vitals",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireMonitorAccess,
    (_req, res) => {
      res.json(getWebVitalsOverview());
    },
  );

  app.get(
    "/internal/load-trend",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireMonitorAccess,
    (_req, res) => {
      const controlState = getControlState();
      res.json({
        predictor: controlState.predictor,
        queueLength: controlState.queueLength,
        requestRate: getRequestRate(),
        p95LatencyMs: getLatencyP95(),
        updatedAt: controlState.updatedAt,
      });
    },
  );

  app.get(
    "/internal/circuit-status",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireMonitorAccess,
    (_req, res) => {
      const controlState = getControlState();
      res.json({
        local: getLocalCircuitSnapshots(),
        cluster: controlState.circuits,
        updatedAt: controlState.updatedAt,
      });
    },
  );

  app.get(
    "/internal/intelligence/explain",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireMonitorAccess,
    (_req, res) => {
      const explain = getIntelligenceExplainability();
      res.json({
        anomalyBreakdown: explain.anomalyBreakdown,
        correlationMatrix: explain.correlationMatrix,
        slopeValues: explain.slopeValues,
        forecastProjection: explain.forecastProjection,
        governanceState: explain.governanceState,
        chosenStrategy: explain.chosenStrategy,
        decisionReason: explain.decisionReason,
      });
    },
  );
}

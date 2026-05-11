import { asyncHandler, routeHandler } from "../http/async-handler";
import { getInternalMetricsSnapshot } from "../internal/metrics";
import type { StartupHealthSnapshot } from "../internal/startup-health";
import type { SystemRouteContext } from "./system-route-context";

function buildLiveHealthPayload(getStartupHealthSnapshot: () => StartupHealthSnapshot) {
  const startup = getStartupHealthSnapshot();
  return {
    status: "ok" as const,
    live: true,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    startup,
    validation: startup.validation,
  };
}

function buildPublicHealthPayload(params: { status: string; ready: boolean }) {
  return {
    status: params.status,
    ready: params.ready,
  };
}

function buildReadinessPayload(params: {
  dbOk: boolean;
  startup: StartupHealthSnapshot;
}) {
  const { dbOk, startup } = params;
  const ready = dbOk && startup.ready && !startup.failed && !startup.degraded;
  const status = ready
    ? "ok"
    : startup.failed
      ? "failed"
      : startup.degraded || !dbOk
        ? "degraded"
        : "starting";
  const startupStatus = startup.failed
    ? "failed"
    : startup.degraded
      ? "degraded"
      : startup.ready
        ? "ready"
        : "starting";

  return {
    status,
    ready,
    mode: "postgresql" as const,
    database: dbOk ? "connected" as const : "unreachable" as const,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    checks: {
      process: "live" as const,
      startup: startupStatus,
      database: dbOk ? "connected" as const : "unreachable" as const,
    },
    startup,
    validation: startup.validation,
  };
}

export function registerSystemHealthRoutes(context: SystemRouteContext) {
  const {
    app,
    authenticateToken,
    requireRole,
    getMaintenanceStateCached,
    checkDbConnectivity,
    getStartupHealthSnapshot,
  } = context;

  app.get("/api/health/live", routeHandler((_req, res) => {
    const startup = getStartupHealthSnapshot();
    res.json(buildPublicHealthPayload({
      status: startup.failed ? "failed" : "ok",
      ready: !startup.failed,
    }));
  }));

  app.get("/api/health/ready", asyncHandler(async (_req, res) => {
    const startup = getStartupHealthSnapshot();
    const dbOk = await checkDbConnectivity();
    const payload = buildReadinessPayload({ dbOk, startup });
    res.status(payload.ready ? 200 : 503).json(buildPublicHealthPayload(payload));
  }));

  app.get("/api/health", asyncHandler(async (_req, res) => {
    const startup = getStartupHealthSnapshot();
    const dbOk = await checkDbConnectivity();
    const readiness = buildReadinessPayload({ dbOk, startup });
    res.status(readiness.ready ? 200 : 503).json(buildPublicHealthPayload(readiness));
  }));

  app.get(
    "/internal/health",
    authenticateToken,
    requireRole("admin", "superuser"),
    asyncHandler(async (_req, res) => {
      const startup = getStartupHealthSnapshot();
      const dbOk = await checkDbConnectivity();
      const readiness = buildReadinessPayload({ dbOk, startup });
      res.status(readiness.ready ? 200 : 503).json({
        ...readiness,
        live: buildLiveHealthPayload(getStartupHealthSnapshot),
      });
    }),
  );

  app.get(
    "/api/metrics",
    authenticateToken,
    requireRole("admin", "superuser"),
    routeHandler((_req, res) => {
      res.json(getInternalMetricsSnapshot());
    }),
  );

  app.get("/api/maintenance-status", asyncHandler(async (_req, res) => {
    return res.json(await getMaintenanceStateCached());
  }));
}

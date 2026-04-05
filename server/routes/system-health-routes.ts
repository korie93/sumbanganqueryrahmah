import { asyncHandler } from "../http/async-handler";
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

function buildReadinessPayload(params: {
  dbOk: boolean;
  startup: StartupHealthSnapshot;
}) {
  const { dbOk, startup } = params;
  const ready = dbOk && startup.ready && !startup.failed;
  const status = ready
    ? "ok"
    : startup.failed
      ? "failed"
      : dbOk
        ? "starting"
        : "degraded";

  return {
    status,
    ready,
    mode: "postgresql" as const,
    database: dbOk ? "connected" as const : "unreachable" as const,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    checks: {
      process: "live" as const,
      startup: startup.failed ? "failed" as const : startup.ready ? "ready" as const : "starting" as const,
      database: dbOk ? "connected" as const : "unreachable" as const,
    },
    startup,
    validation: startup.validation,
  };
}

export function registerSystemHealthRoutes(context: SystemRouteContext) {
  const {
    app,
    getMaintenanceStateCached,
    checkDbConnectivity,
    getStartupHealthSnapshot,
  } = context;

  app.get("/api/health/live", (_req, res) => {
    res.json(buildLiveHealthPayload(getStartupHealthSnapshot));
  });

  app.get("/api/health/ready", asyncHandler(async (_req, res) => {
    const startup = getStartupHealthSnapshot();
    const dbOk = await checkDbConnectivity();
    const payload = buildReadinessPayload({ dbOk, startup });
    res.status(payload.ready ? 200 : 503).json(payload);
  }));

  app.get("/api/health", asyncHandler(async (_req, res) => {
    const startup = getStartupHealthSnapshot();
    const dbOk = await checkDbConnectivity();
    const readiness = buildReadinessPayload({ dbOk, startup });
    res.status(readiness.ready ? 200 : 503).json({
      ...readiness,
      live: buildLiveHealthPayload(getStartupHealthSnapshot),
    });
  }));

  app.get("/api/maintenance-status", asyncHandler(async (_req, res) => {
    return res.json(await getMaintenanceStateCached());
  }));
}

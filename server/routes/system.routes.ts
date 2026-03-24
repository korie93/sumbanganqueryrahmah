import type { Express, RequestHandler, Response } from "express";
import type { AuthenticatedRequest } from "../auth/guards";
import type { MaintenanceState } from "../config/system-settings";
import { asyncHandler } from "../http/async-handler";
import type { ChaosEvent, InjectChaosInput } from "../intelligence/chaos/ChaosEngine";
import type { ChaosType, ExplainabilityReport } from "../intelligence/types";
import type { StartupHealthSnapshot } from "../internal/startup-health";
import type { CircuitSnapshot } from "../internal/circuitBreaker";
import type {
  InternalMonitorAlert,
  InternalMonitorSnapshot,
  WorkerControlState,
} from "../internal/runtime-monitor-manager";
import type { AuditLog, InsertAuditLog } from "../../shared/schema-postgres";

type LocalCircuitSnapshots = {
  ai: CircuitSnapshot;
  db: CircuitSnapshot;
  export: CircuitSnapshot;
};

type ChaosInjectionResult = {
  injected: ChaosEvent;
  active: ChaosEvent[];
};

type SystemRouteDeps = {
  authenticateToken: RequestHandler;
  requireRole: (...roles: string[]) => RequestHandler;
  requireMonitorAccess: RequestHandler;
  getMaintenanceStateCached: () => Promise<MaintenanceState>;
  computeInternalMonitorSnapshot: () => InternalMonitorSnapshot;
  buildInternalMonitorAlerts: (snapshot: InternalMonitorSnapshot) => InternalMonitorAlert[];
  getControlState: () => WorkerControlState;
  getDbProtection: () => boolean;
  getRequestRate: () => number;
  getLatencyP95: () => number;
  getLocalCircuitSnapshots: () => LocalCircuitSnapshots;
  getIntelligenceExplainability: () => ExplainabilityReport;
  injectChaos: (params: InjectChaosInput) => ChaosInjectionResult;
  createAuditLog: (data: InsertAuditLog) => Promise<AuditLog>;
  checkDbConnectivity: () => Promise<boolean>;
  getStartupHealthSnapshot: () => StartupHealthSnapshot;
};

export function registerSystemRoutes(app: Express, deps: SystemRouteDeps) {
  const {
    authenticateToken,
    requireRole,
    requireMonitorAccess,
    getMaintenanceStateCached,
    computeInternalMonitorSnapshot,
    buildInternalMonitorAlerts,
    getControlState,
    getDbProtection,
    getRequestRate,
    getLatencyP95,
    getLocalCircuitSnapshots,
    getIntelligenceExplainability,
    injectChaos,
    createAuditLog,
    checkDbConnectivity,
    getStartupHealthSnapshot,
  } = deps;

  function buildLiveHealthPayload() {
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

  app.get("/api/health/live", (_req, res) => {
    res.json(buildLiveHealthPayload());
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
    const payload = {
      ...readiness,
      live: buildLiveHealthPayload(),
    };
    res.status(readiness.ready ? 200 : 503).json(payload);
  }));

  app.get("/api/maintenance-status", asyncHandler(async (_req, res) => {
    return res.json(await getMaintenanceStateCached());
  }));

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
    "/internal/alerts",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireMonitorAccess,
    (_req, res) => {
      const snapshot = computeInternalMonitorSnapshot();
      const alerts = buildInternalMonitorAlerts(snapshot);
      res.json({
        alerts,
        updatedAt: snapshot.updatedAt,
      });
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

  app.post(
    "/internal/chaos/inject",
    authenticateToken,
    requireRole("admin", "superuser"),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const body = (req.body && typeof req.body === "object") ? req.body as Record<string, unknown> : {};
      const type = body.type as ChaosType;
      const magnitude = body.magnitude;
      const durationMs = body.durationMs;
      const allowed = new Set<ChaosType>([
        "cpu_spike",
        "db_latency_spike",
        "ai_delay",
        "worker_crash",
        "memory_pressure",
      ]);

      if (!allowed.has(type)) {
        return res.status(400).json({
          message: "Invalid chaos type.",
          allowed: Array.from(allowed),
        });
      }

      const result = injectChaos({
        type,
        magnitude: Number.isFinite(Number(magnitude)) ? Number(magnitude) : undefined,
        durationMs: Number.isFinite(Number(durationMs)) ? Number(durationMs) : undefined,
      });

      await createAuditLog({
        action: "CHAOS_INJECTED",
        performedBy: req.user?.username || "system",
        details: `Chaos injected: ${type}`,
      });

      return res.json({
        success: true,
        ...result,
      });
    }),
  );
}

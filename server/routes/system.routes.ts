import type { Express, RequestHandler, Response } from "express";
import type { AuthenticatedRequest } from "../auth/guards";
import type { MaintenanceState } from "../config/system-settings";
import { asyncHandler } from "../http/async-handler";
import type { ChaosEvent, InjectChaosInput } from "../intelligence/chaos/ChaosEngine";
import type { ChaosType, ExplainabilityReport } from "../intelligence/types";
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
  } = deps;

  app.get("/api/health", asyncHandler(async (_req, res) => {
    const dbOk = await checkDbConnectivity();
    const status = dbOk ? "ok" : "degraded";
    const statusCode = dbOk ? 200 : 503;
    res.status(statusCode).json({
      status,
      mode: "postgresql",
      database: dbOk ? "connected" : "unreachable",
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
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

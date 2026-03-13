import type { Express, RequestHandler, Response } from "express";
import type { AuthenticatedRequest } from "../auth/guards";
import { asyncHandler } from "../http/async-handler";
import type { InjectChaosInput } from "../intelligence/chaos/ChaosEngine";
import type { ChaosType } from "../intelligence/types";
import type {
  InternalMonitorAlert,
  InternalMonitorSnapshot,
} from "../internal/runtime-monitor-manager";

type ControlState = {
  mode: string;
  throttleFactor: number;
  rejectHeavyRoutes: boolean;
  preAllocateMB: number;
  updatedAt: unknown;
  workerCount: number;
  maxWorkers: number;
  workers: unknown;
  predictor: unknown;
  queueLength: number;
  circuits: unknown;
};

type SystemRouteDeps = {
  authenticateToken: RequestHandler;
  requireRole: (...roles: string[]) => RequestHandler;
  requireMonitorAccess: RequestHandler;
  getMaintenanceStateCached: () => Promise<unknown>;
  computeInternalMonitorSnapshot: () => InternalMonitorSnapshot;
  buildInternalMonitorAlerts: (snapshot: InternalMonitorSnapshot) => InternalMonitorAlert[];
  getControlState: () => ControlState;
  getDbProtection: () => unknown;
  getRequestRate: () => number;
  getLatencyP95: () => number;
  getLocalCircuitSnapshots: () => unknown;
  getIntelligenceExplainability: () => {
    anomalyBreakdown: unknown;
    correlationMatrix: unknown;
    slopeValues: unknown;
    forecastProjection: unknown;
    governanceState: unknown;
    chosenStrategy: unknown;
    decisionReason: unknown;
  };
  injectChaos: (params: InjectChaosInput) => {
    injected: unknown;
    active: unknown;
  };
  createAuditLog: (data: {
    action: string;
    performedBy: string;
    details?: string;
  }) => Promise<unknown>;
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
  } = deps;

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", mode: "postgresql" });
  });

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

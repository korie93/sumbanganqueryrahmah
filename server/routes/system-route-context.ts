import type { Express, RequestHandler } from "express";
import type { MaintenanceState } from "../config/system-settings";
import type { ChaosEvent, InjectChaosInput } from "../intelligence/chaos/ChaosEngine";
import type { ChaosType, ExplainabilityReport } from "../intelligence/types";
import type { CircuitSnapshot } from "../internal/circuitBreaker";
import type {
  InternalMonitorAlert,
  InternalMonitorSnapshot,
  WorkerControlState,
} from "../internal/runtime-monitor-manager";
import type { StartupHealthSnapshot } from "../internal/startup-health";
import type { MonitorAlertIncidentPage } from "../repositories/monitor-alert-history.repository";
import type { AuditLog, InsertAuditLog } from "../../shared/schema-postgres";
import type { WebVitalOverviewPayload } from "../../shared/web-vitals";

export type LocalCircuitSnapshots = {
  ai: CircuitSnapshot;
  db: CircuitSnapshot;
  export: CircuitSnapshot;
};

export type ChaosInjectionResult = {
  injected: ChaosEvent;
  active: ChaosEvent[];
};

export type SystemRouteDeps = {
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
  getCollectionRollupQueueStatus: () => Promise<{
    pendingCount: number;
    runningCount: number;
    retryCount: number;
    oldestPendingAgeMs: number;
  }>;
  drainCollectionRollupQueue: () => Promise<Record<string, unknown>>;
  retryCollectionRollupFailures: () => Promise<Record<string, unknown>>;
  autoHealCollectionRollupQueue: () => Promise<Record<string, unknown>>;
  rebuildCollectionRollups: () => Promise<Record<string, unknown>>;
  listMonitorAlertHistory: (options?: { page?: number; pageSize?: number }) => Promise<MonitorAlertIncidentPage>;
  deleteMonitorAlertHistoryOlderThan: (cutoffDate: Date) => Promise<number>;
  getWebVitalsOverview: () => WebVitalOverviewPayload;
  createAuditLog: (data: InsertAuditLog) => Promise<AuditLog>;
  checkDbConnectivity: () => Promise<boolean>;
  getStartupHealthSnapshot: () => StartupHealthSnapshot;
};

export type SystemRouteContext = {
  app: Express;
} & SystemRouteDeps;

export function createSystemRouteContext(
  app: Express,
  deps: SystemRouteDeps,
): SystemRouteContext {
  return {
    app,
    ...deps,
  };
}

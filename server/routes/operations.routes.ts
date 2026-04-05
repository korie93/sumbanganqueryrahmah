import type { Express } from "express";
import { registerOperationsAnalyticsRoutes } from "./operations-analytics-routes";
import { registerOperationsAuditRoutes } from "./operations-audit-routes";
import { registerOperationsBackupRoutes } from "./operations-backup-routes";
import { registerOperationsDebugRoutes } from "./operations-debug-routes";
import {
  createOperationsRouteContext,
  type OperationsRouteDeps,
} from "./operations-route-context";

export function registerOperationsRoutes(app: Express, deps: OperationsRouteDeps) {
  const context = createOperationsRouteContext(app, deps);
  registerOperationsAuditRoutes(context);
  registerOperationsAnalyticsRoutes(context);
  registerOperationsBackupRoutes(context);
  registerOperationsDebugRoutes(context);
}

export type { OperationsRouteDeps } from "./operations-route-context";

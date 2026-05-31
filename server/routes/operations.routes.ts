import type { Express } from "express";
import { registerOperationsAnalyticsRoutes } from "./operations-analytics-routes";
import { registerOperationsAuditRoutes } from "./operations-audit-routes";
import { registerOperationsBackupRoutes } from "./operations-backup-routes";
import {
  createOperationsDebugRouteStartupLock,
  registerOperationsDebugRoutes,
} from "./operations-debug-routes";
import {
  createOperationsRouteContext,
  type OperationsRouteDeps,
} from "./operations-route-context";

export function registerOperationsRoutes(app: Express, deps: OperationsRouteDeps) {
  const context = createOperationsRouteContext(app, deps);
  registerOperationsAuditRoutes(context);
  registerOperationsAnalyticsRoutes(context);
  registerOperationsBackupRoutes(context);
  const debugRouteStartupLock = createOperationsDebugRouteStartupLock({
    enabled: context.operationsDebugRoutesEnabled,
    productionLike: context.operationsDebugRoutesProductionLike,
    accessToken: context.operationsDebugAccessToken,
    allowedIps: context.operationsDebugAllowedIps,
  });
  registerOperationsDebugRoutes(context, debugRouteStartupLock);
}

export type { OperationsRouteDeps } from "./operations-route-context";

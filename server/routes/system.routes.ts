import type { Express } from "express";
import { registerSystemAlertRoutes } from "./system-alert-routes";
import { registerSystemChaosRoutes } from "./system-chaos-routes";
import { registerSystemHealthRoutes } from "./system-health-routes";
import { registerSystemMonitorRoutes } from "./system-monitor-routes";
import {
  createSystemRouteContext,
  type SystemRouteDeps,
} from "./system-route-context";
import { registerSystemRollupRoutes } from "./system-rollup-routes";

export function registerSystemRoutes(app: Express, deps: SystemRouteDeps) {
  const context = createSystemRouteContext(app, deps);
  registerSystemHealthRoutes(context);
  registerSystemMonitorRoutes(context);
  registerSystemAlertRoutes(context);
  registerSystemRollupRoutes(context);
  registerSystemChaosRoutes(context);
}

export type {
  ChaosInjectionResult,
  LocalCircuitSnapshots,
  SystemRouteDeps,
} from "./system-route-context";

import type { Express } from "express";
import { registerImportsAnalysisRoutes } from "./imports-analysis-routes";
import {
  createImportsRouteContext,
  type ImportsRouteDeps,
} from "./imports-route-context";
import { registerImportsMutationRoutes } from "./imports-mutation-routes";
import { registerImportsReadRoutes } from "./imports-read-routes";

export function registerImportRoutes(app: Express, deps: ImportsRouteDeps) {
  const context = createImportsRouteContext(app, deps);
  registerImportsReadRoutes(context);
  registerImportsAnalysisRoutes(context);
  registerImportsMutationRoutes(context);
}

export type { ImportsRouteDeps } from "./imports-route-context";

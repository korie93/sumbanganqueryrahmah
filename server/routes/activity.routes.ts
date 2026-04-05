import type { Express } from "express";
import { registerActivityMutationRoutes } from "./activity-mutation-routes";
import { registerActivityReadRoutes } from "./activity-read-routes";
import {
  createActivityRouteContext,
  type ActivityRouteDeps,
} from "./activity-route-context";

export function registerActivityRoutes(app: Express, deps: ActivityRouteDeps) {
  const context = createActivityRouteContext(app, deps);
  registerActivityReadRoutes(context);
  registerActivityMutationRoutes(context);
}

export type { ActivityRouteDeps } from "./activity-route-context";

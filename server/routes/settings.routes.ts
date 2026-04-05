import type { Express } from "express";
import { registerSettingsMutationRoutes } from "./settings-mutation-routes";
import { registerSettingsReadRoutes } from "./settings-read-routes";
import {
  createSettingsRouteContext,
  type SettingsRouteDeps,
} from "./settings-route-context";

export function registerSettingsRoutes(app: Express, deps: SettingsRouteDeps) {
  const context = createSettingsRouteContext(app, deps);
  registerSettingsReadRoutes(context);
  registerSettingsMutationRoutes(context);
}

export type { SettingsRouteDeps } from "./settings-route-context";

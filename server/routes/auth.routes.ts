import type { Express } from "express";
import {
  createAuthRouteContext,
  type AuthRouteDeps,
} from "./auth/auth-route-shared";
import { registerAuthAdminRoutes } from "./auth/auth-admin-routes";
import { registerAuthRecoveryRoutes } from "./auth/auth-recovery-routes";
import { registerAuthSessionRoutes } from "./auth/auth-session-routes";

export function registerAuthRoutes(app: Express, deps: AuthRouteDeps) {
  const context = createAuthRouteContext(app, deps);
  registerAuthSessionRoutes(context);
  registerAuthRecoveryRoutes(context);
  registerAuthAdminRoutes(context);
}

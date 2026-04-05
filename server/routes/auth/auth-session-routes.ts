import type { AuthRouteContext } from "./auth-route-shared";
import { registerAuthLoginRoutes } from "./auth-login-routes";
import { registerAuthSelfServiceRoutes } from "./auth-self-service-routes";

export function registerAuthSessionRoutes(context: AuthRouteContext) {
  registerAuthLoginRoutes(context);
  registerAuthSelfServiceRoutes(context);
}

import type { AuthRouteContext } from "./auth-route-shared";
import { registerAuthAdminMutationRoutes } from "./auth-admin-mutation-routes";
import { registerAuthAdminReadRoutes } from "./auth-admin-read-routes";

export function registerAuthAdminRoutes(context: AuthRouteContext) {
  registerAuthAdminReadRoutes(context);
  registerAuthAdminMutationRoutes(context);
}

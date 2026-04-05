import type { AuthRouteContext } from "./auth-route-shared";
import { registerAuthDevMailRoutes } from "./auth-dev-mail-routes";
import { registerAuthPublicRecoveryRoutes } from "./auth-public-recovery-routes";

export function registerAuthRecoveryRoutes(context: AuthRouteContext) {
  registerAuthPublicRecoveryRoutes(context);
  registerAuthDevMailRoutes(context);
}

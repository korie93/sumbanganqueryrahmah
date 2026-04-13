import { runtimeConfig } from "../config/runtime";
import { asyncHandler } from "../http/async-handler";
import type { OperationsRouteContext } from "./operations-route-context";

export function isOperationsDebugRoutesEnabled(
  enabled: boolean = runtimeConfig.app.operationsDebugRoutesEnabled,
) {
  return enabled;
}

export function registerOperationsDebugRoutes(
  context: OperationsRouteContext,
  options: {
    enabled?: boolean;
  } = {},
) {
  if (!isOperationsDebugRoutesEnabled(options.enabled)) {
    return;
  }

  const {
    app,
    operationsController,
    authenticateToken,
    requireRole,
  } = context;

  app.get(
    "/api/debug/websocket-clients",
    authenticateToken,
    requireRole("superuser"),
    asyncHandler(operationsController.getWebsocketClients),
  );
}

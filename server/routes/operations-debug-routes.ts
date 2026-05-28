import { runtimeConfig } from "../config/runtime";
import { asyncHandler } from "../http/async-handler";
import type { OperationsRouteContext } from "./operations-route-context";

export function isOperationsDebugRoutesEnabled(
  enabled: boolean = runtimeConfig.app.operationsDebugRoutesEnabled,
  productionLike: boolean = runtimeConfig.app.isProductionLike,
) {
  return enabled && !productionLike;
}

export function registerOperationsDebugRoutes(
  context: OperationsRouteContext,
  options: {
    enabled?: boolean | undefined;
    productionLike?: boolean | undefined;
  } = {},
) {
  if (!isOperationsDebugRoutesEnabled(options.enabled, options.productionLike)) {
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

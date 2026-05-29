import { asyncHandler } from "../http/async-handler";
import type { OperationsRouteContext } from "./operations-route-context";

export type OperationsDebugRouteStartupLock = Readonly<{
  enabled: boolean;
  requested: boolean;
  productionLike: boolean;
  reason: "enabled-local" | "disabled" | "production-like";
}>;

export function isOperationsDebugRoutesEnabled(
  enabled: boolean,
  productionLike: boolean,
) {
  return enabled && !productionLike;
}

export function createOperationsDebugRouteStartupLock(params: {
  enabled?: boolean | undefined;
  productionLike?: boolean | undefined;
}): OperationsDebugRouteStartupLock {
  const requested = params.enabled === true;
  const productionLike = params.productionLike !== false;
  const enabled = isOperationsDebugRoutesEnabled(requested, productionLike);
  const reason = enabled
    ? "enabled-local"
    : productionLike
      ? "production-like"
      : "disabled";

  return Object.freeze({
    enabled,
    requested,
    productionLike,
    reason,
  });
}

export function registerOperationsDebugRoutes(
  context: OperationsRouteContext,
  startupLock: OperationsDebugRouteStartupLock,
) {
  if (!startupLock.enabled) {
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

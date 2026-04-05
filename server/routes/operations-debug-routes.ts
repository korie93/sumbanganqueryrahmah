import { asyncHandler } from "../http/async-handler";
import type { OperationsRouteContext } from "./operations-route-context";

export function registerOperationsDebugRoutes(context: OperationsRouteContext) {
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

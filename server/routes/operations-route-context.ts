import type { Express, RequestHandler } from "express";
import type { OperationsController } from "../controllers/operations.controller";

export type OperationsRouteDeps = {
  operationsController: OperationsController;
  authenticateToken: RequestHandler;
  requireRole: (...roles: string[]) => RequestHandler;
  requireTabAccess: (tabId: string) => RequestHandler;
  debugAuditMiddleware?: RequestHandler | undefined;
  operationsDebugRoutesEnabled?: boolean | undefined;
  operationsDebugRoutesProductionLike?: boolean | undefined;
  operationsDebugAccessToken?: string | null | undefined;
  operationsDebugAllowedIps?: readonly string[] | undefined;
};

export type OperationsRouteContext = {
  app: Express;
  operationsController: OperationsController;
  authenticateToken: RequestHandler;
  requireRole: (...roles: string[]) => RequestHandler;
  requireTabAccess: (tabId: string) => RequestHandler;
  debugAuditMiddleware?: RequestHandler | undefined;
  operationsDebugRoutesEnabled?: boolean | undefined;
  operationsDebugRoutesProductionLike?: boolean | undefined;
  operationsDebugAccessToken?: string | null | undefined;
  operationsDebugAllowedIps?: readonly string[] | undefined;
};

export function createOperationsRouteContext(
  app: Express,
  deps: OperationsRouteDeps,
): OperationsRouteContext {
  return {
    app,
    operationsController: deps.operationsController,
    authenticateToken: deps.authenticateToken,
    requireRole: deps.requireRole,
    requireTabAccess: deps.requireTabAccess,
    debugAuditMiddleware: deps.debugAuditMiddleware,
    operationsDebugRoutesEnabled: deps.operationsDebugRoutesEnabled,
    operationsDebugRoutesProductionLike: deps.operationsDebugRoutesProductionLike,
    operationsDebugAccessToken: deps.operationsDebugAccessToken,
    operationsDebugAllowedIps: deps.operationsDebugAllowedIps,
  };
}

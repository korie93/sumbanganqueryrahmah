import type { Express, RequestHandler } from "express";
import type { OperationsController } from "../controllers/operations.controller";

export type OperationsRouteDeps = {
  operationsController: OperationsController;
  authenticateToken: RequestHandler;
  requireRole: (...roles: string[]) => RequestHandler;
  requireTabAccess: (tabId: string) => RequestHandler;
};

export type OperationsRouteContext = {
  app: Express;
  operationsController: OperationsController;
  authenticateToken: RequestHandler;
  requireRole: (...roles: string[]) => RequestHandler;
  requireTabAccess: (tabId: string) => RequestHandler;
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
  };
}

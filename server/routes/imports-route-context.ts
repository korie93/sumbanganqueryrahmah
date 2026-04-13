import type { Express, RequestHandler } from "express";
import type { ImportsController } from "../controllers/imports.controller";
import { createImportsMultipartRoute } from "./imports-multipart-route";

export type ImportsRouteDeps = {
  importsController: ImportsController;
  authenticateToken: RequestHandler;
  requireRole: (...roles: string[]) => RequestHandler;
  requireTabAccess: (tabId: string) => RequestHandler;
  searchRateLimiter: RequestHandler;
  importsUploadRateLimiter?: RequestHandler | undefined;
  multipartMaxFileSizeBytes?: number | undefined;
  multipartPerUserQuotaBytes?: number | undefined;
};

export type ImportsRouteContext = {
  app: Express;
  importsController: ImportsController;
  authenticateToken: RequestHandler;
  requireRole: (...roles: string[]) => RequestHandler;
  requireTabAccess: (tabId: string) => RequestHandler;
  searchRateLimiter: RequestHandler;
  importsUploadRateLimiter: RequestHandler;
  importsMultipartRoute: RequestHandler;
};

export function createImportsRouteContext(
  app: Express,
  deps: ImportsRouteDeps,
): ImportsRouteContext {
  return {
    app,
    importsController: deps.importsController,
    authenticateToken: deps.authenticateToken,
    requireRole: deps.requireRole,
    requireTabAccess: deps.requireTabAccess,
    searchRateLimiter: deps.searchRateLimiter,
    importsUploadRateLimiter: deps.importsUploadRateLimiter ?? ((_req, _res, next) => next()),
    importsMultipartRoute: createImportsMultipartRoute(
      deps.multipartMaxFileSizeBytes,
      deps.multipartPerUserQuotaBytes,
    ),
  };
}

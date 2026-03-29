import type { Express, RequestHandler } from "express";
import type { ImportsController } from "../controllers/imports.controller";
import { asyncHandler } from "../http/async-handler";
import { createImportsMultipartRoute } from "./imports-multipart-route";

type ImportsRouteDeps = {
  importsController: ImportsController;
  authenticateToken: RequestHandler;
  requireRole: (...roles: string[]) => RequestHandler;
  requireTabAccess: (tabId: string) => RequestHandler;
  searchRateLimiter: RequestHandler;
};

export function registerImportRoutes(app: Express, deps: ImportsRouteDeps) {
  const {
    importsController,
    authenticateToken,
    requireRole,
    requireTabAccess,
    searchRateLimiter,
  } = deps;
  const importsMultipartRoute = createImportsMultipartRoute();

  app.get("/api/data-rows", authenticateToken, asyncHandler(importsController.listDataRows));

  app.get("/api/imports", authenticateToken, asyncHandler(importsController.listImports));

  app.post("/api/imports", authenticateToken, importsMultipartRoute, asyncHandler(importsController.createImport));

  app.get("/api/imports/:id", authenticateToken, asyncHandler(importsController.getImport));

  app.get("/api/imports/:id/data", authenticateToken, searchRateLimiter, asyncHandler(importsController.getImportDataPage));

  app.get(
    "/api/imports/:id/analyze",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("analysis"),
    asyncHandler(importsController.analyzeImport),
  );

  app.get("/api/analyze/all-summary", authenticateToken, asyncHandler(importsController.analyzeAll));

  app.get(
    "/api/analyze/all",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("analysis"),
    asyncHandler(importsController.analyzeAll),
  );

  app.patch("/api/imports/:id", authenticateToken, asyncHandler(importsController.renameImport));

  app.patch("/api/imports/:id/rename", authenticateToken, asyncHandler(importsController.renameImport));

  app.delete(
    "/api/imports/:id",
    authenticateToken,
    requireRole("admin", "superuser"),
    asyncHandler(importsController.deleteImport),
  );
}

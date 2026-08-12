import { asyncHandler } from "../http/async-handler";
import type { ImportsRouteContext } from "./imports-route-context";

export function registerImportsReadRoutes(context: ImportsRouteContext) {
  const {
    app,
    importsController,
    authenticateToken,
    requireRole,
    requireTabAccess,
    searchRateLimiter,
  } = context;

  app.get("/api/data-rows", authenticateToken, asyncHandler(importsController.listDataRows));
  app.get(
    "/api/imports",
    authenticateToken,
    requireRole("user", "admin", "manager", "superuser"),
    requireTabAccess("import"),
    asyncHandler(importsController.listImports),
  );
  app.post(
    "/api/imports/comparison",
    authenticateToken,
    requireRole("user", "admin", "manager", "superuser"),
    requireTabAccess("import"),
    searchRateLimiter,
    asyncHandler(importsController.compareImports),
  );
  app.get(
    "/api/imports/:id/summary",
    authenticateToken,
    requireRole("user", "admin", "manager", "superuser"),
    requireTabAccess("import"),
    asyncHandler(importsController.getImportSummary),
  );
  app.get(
    "/api/imports/:id",
    authenticateToken,
    requireRole("user", "admin", "manager", "superuser"),
    requireTabAccess("import"),
    asyncHandler(importsController.getImport),
  );
  app.get(
    "/api/import-jobs/:jobId",
    authenticateToken,
    requireRole("user", "admin", "manager", "superuser"),
    requireTabAccess("import"),
    asyncHandler(importsController.getImportJob),
  );
  app.get(
    "/api/imports/:id/data",
    authenticateToken,
    requireRole("user", "admin", "manager", "superuser"),
    requireTabAccess("import"),
    searchRateLimiter,
    asyncHandler(importsController.getImportDataPage),
  );
}

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

  // Shared read resources are available to an enabled consuming feature; upload
  // and other mutations keep their separate existing Import action guards.
  const requireImportRead = requireTabAccess("import", "saved", "viewer");
  app.get("/api/data-rows", authenticateToken, requireImportRead, asyncHandler(importsController.listDataRows));
  app.get(
    "/api/imports",
    authenticateToken,
    requireRole("user", "admin", "manager", "superuser"),
    requireTabAccess("import", "saved", "viewer", "analysis"),
    asyncHandler(importsController.listImports),
  );
  app.post(
    "/api/imports/comparison",
    authenticateToken,
    requireRole("user", "admin", "manager", "superuser"),
    requireTabAccess("import", "saved"),
    searchRateLimiter,
    asyncHandler(importsController.compareImports),
  );
  app.get(
    "/api/imports/:id/summary",
    authenticateToken,
    requireRole("user", "admin", "manager", "superuser"),
    requireImportRead,
    asyncHandler(importsController.getImportSummary),
  );
  app.get(
    "/api/imports/:id",
    authenticateToken,
    requireRole("user", "admin", "manager", "superuser"),
    requireImportRead,
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
    requireImportRead,
    searchRateLimiter,
    asyncHandler(importsController.getImportDataPage),
  );
}

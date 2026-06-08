import { asyncHandler } from "../http/async-handler";
import type { ImportsRouteContext } from "./imports-route-context";

export function registerImportsReadRoutes(context: ImportsRouteContext) {
  const {
    app,
    importsController,
    authenticateToken,
    requireRole,
    searchRateLimiter,
  } = context;

  app.get("/api/data-rows", authenticateToken, asyncHandler(importsController.listDataRows));
  app.get(
    "/api/imports",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    asyncHandler(importsController.listImports),
  );
  app.get(
    "/api/imports/:id",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    asyncHandler(importsController.getImport),
  );
  app.get(
    "/api/imports/:id/data",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    searchRateLimiter,
    asyncHandler(importsController.getImportDataPage),
  );
}

import { asyncHandler } from "../http/async-handler";
import type { ImportsRouteContext } from "./imports-route-context";

export function registerImportsAnalysisRoutes(context: ImportsRouteContext) {
  const {
    app,
    importsController,
    authenticateToken,
    requireRole,
    requireTabAccess,
  } = context;

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
}

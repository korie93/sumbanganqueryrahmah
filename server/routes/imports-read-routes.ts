import { asyncHandler } from "../http/async-handler";
import type { ImportsRouteContext } from "./imports-route-context";

export function registerImportsReadRoutes(context: ImportsRouteContext) {
  const {
    app,
    importsController,
    authenticateToken,
    searchRateLimiter,
  } = context;

  app.get("/api/data-rows", authenticateToken, asyncHandler(importsController.listDataRows));
  app.get("/api/imports", authenticateToken, asyncHandler(importsController.listImports));
  app.get("/api/imports/:id", authenticateToken, asyncHandler(importsController.getImport));
  app.get(
    "/api/imports/:id/data",
    authenticateToken,
    searchRateLimiter,
    asyncHandler(importsController.getImportDataPage),
  );
}

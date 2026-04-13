import { asyncHandler } from "../http/async-handler";
import type { ImportsRouteContext } from "./imports-route-context";

export function registerImportsMutationRoutes(context: ImportsRouteContext) {
  const {
    app,
    importsController,
    authenticateToken,
    importsUploadRateLimiter,
    requireRole,
    importsMultipartRoute,
  } = context;

  app.post(
    "/api/imports",
    authenticateToken,
    importsUploadRateLimiter,
    importsMultipartRoute,
    asyncHandler(importsController.createImport),
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

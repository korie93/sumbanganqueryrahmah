import { asyncHandler } from "../http/async-handler";
import type { ImportsRouteContext } from "./imports-route-context";

export function registerImportsMutationRoutes(context: ImportsRouteContext) {
  const {
    app,
    importsController,
    authenticateToken,
    importsUploadRateLimiter,
    requireRole,
    requireTabAccess,
    importsMultipartRoute,
  } = context;

  app.post(
    "/api/imports",
    authenticateToken,
    requireRole("user", "admin", "manager", "superuser"),
    requireTabAccess("import"),
    importsUploadRateLimiter,
    importsMultipartRoute,
    asyncHandler(importsController.createImport),
  );

  app.patch(
    "/api/imports/:id",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("import"),
    asyncHandler(importsController.renameImport),
  );
  app.patch(
    "/api/imports/:id/rename",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("import"),
    asyncHandler(importsController.renameImport),
  );

  app.delete(
    "/api/imports/:id",
    authenticateToken,
    requireRole("admin", "superuser"),
    requireTabAccess("import"),
    asyncHandler(importsController.deleteImport),
  );
}

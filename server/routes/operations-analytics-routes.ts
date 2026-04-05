import { asyncHandler } from "../http/async-handler";
import type { OperationsRouteContext } from "./operations-route-context";

export function registerOperationsAnalyticsRoutes(context: OperationsRouteContext) {
  const {
    app,
    operationsController,
    authenticateToken,
    requireRole,
    requireTabAccess,
  } = context;

  app.get(
    "/api/analytics/summary",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("dashboard"),
    asyncHandler(operationsController.getDashboardSummary),
  );

  app.get(
    "/api/analytics/login-trends",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("dashboard"),
    asyncHandler(operationsController.getLoginTrends),
  );

  app.get(
    "/api/analytics/top-users",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("dashboard"),
    asyncHandler(operationsController.getTopActiveUsers),
  );

  app.get(
    "/api/analytics/peak-hours",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("dashboard"),
    asyncHandler(operationsController.getPeakHours),
  );

  app.get(
    "/api/analytics/role-distribution",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("dashboard"),
    asyncHandler(operationsController.getRoleDistribution),
  );
}

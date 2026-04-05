import type { AuthRouteContext } from "./auth-route-shared";

export function registerAuthAdminReadRoutes(context: AuthRouteContext) {
  const {
    app,
    authAccountService,
    authenticateToken,
    requireRole,
    rateLimiters,
    jsonRoute,
    buildManagedUserPayload,
    buildOkPayload,
  } = context;

  app.get(
    "/api/admin/users",
    authenticateToken,
    requireRole("superuser"),
    rateLimiters.adminAction,
    jsonRoute(async (req) => {
      const result = await authAccountService.getManagedUsers(
        req.user,
        req.query as Record<string, unknown>,
      );
      return {
        ok: true,
        users: result.users.map((user) => buildManagedUserPayload(user)),
        pagination: result.pagination,
      };
    }),
  );

  app.get(
    "/api/admin/password-reset-requests",
    authenticateToken,
    requireRole("superuser"),
    rateLimiters.adminAction,
    jsonRoute(async (req) => {
      const result = await authAccountService.listPendingPasswordResetRequests(
        req.user,
        req.query as Record<string, unknown>,
      );
      return {
        ok: true,
        requests: result.requests,
        pagination: result.pagination,
      };
    }),
  );

  app.get(
    "/api/accounts",
    authenticateToken,
    requireRole("superuser"),
    rateLimiters.adminAction,
    jsonRoute(async (req) => {
      const accounts = await authAccountService.getAccounts(req.user);
      return buildOkPayload({ accounts });
    }),
  );
}

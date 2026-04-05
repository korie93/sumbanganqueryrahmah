import { AuthAccountError } from "../../services/auth-account.service";
import {
  readManagedCredentialsBody,
  readManagedUserBody,
  readManagedUserPatchBody,
  readManagedUserRoleBody,
  readManagedUserStatusBody,
} from "./auth-request-parsers";
import type { AuthRouteContext } from "./auth-route-shared";

export function registerAuthAdminMutationRoutes(context: AuthRouteContext) {
  const {
    app,
    authAccountService,
    authenticateToken,
    requireRole,
    rateLimiters,
    jsonRoute,
    closeActivitySockets,
    buildUserPayload,
    buildDeliveryPayload,
  } = context;

  const handleCreateManagedUser = jsonRoute(async (req) => {
    const result = await authAccountService.createManagedUser(req.user, readManagedUserBody(req.body));

    return {
      ok: true,
      user: buildUserPayload(result.user),
      activation: buildDeliveryPayload(result.activation),
    };
  });

  app.post(
    "/api/admin/users",
    authenticateToken,
    requireRole("superuser"),
    rateLimiters.adminAction,
    handleCreateManagedUser,
  );

  app.patch(
    "/api/admin/users/:id",
    authenticateToken,
    requireRole("superuser"),
    rateLimiters.adminAction,
    jsonRoute(async (req) => {
      const user = await authAccountService.updateManagedUser(
        req.user,
        req.params.id,
        readManagedUserPatchBody(req.body),
      );

      return {
        ok: true,
        user: buildUserPayload(user),
      };
    }),
  );

  app.delete(
    "/api/admin/users/:id",
    authenticateToken,
    requireRole("superuser"),
    rateLimiters.adminAction,
    jsonRoute(async (req) => {
      const result = await authAccountService.deleteManagedUser(req.user, req.params.id);
      closeActivitySockets(
        result.closedSessionIds,
        "Account deleted by superuser.",
      );

      return {
        ok: true,
        deleted: true,
        user: buildUserPayload(result.user),
      };
    }),
  );

  app.patch(
    "/api/admin/users/:id/role",
    authenticateToken,
    requireRole("superuser"),
    rateLimiters.adminAction,
    jsonRoute(async (req) => {
      const body = readManagedUserRoleBody(req.body);
      const result = await authAccountService.updateManagedUserRole(
        req.user,
        req.params.id,
        body.role,
      );
      closeActivitySockets(
        result.closedSessionIds,
        "Account role changed. Please login again.",
      );

      return {
        ok: true,
        forceLogout: result.closedSessionIds.length > 0,
        user: buildUserPayload(result.user),
      };
    }),
  );

  app.patch(
    "/api/admin/users/:id/status",
    authenticateToken,
    requireRole("superuser"),
    rateLimiters.adminAction,
    jsonRoute(async (req) => {
      const body = readManagedUserStatusBody(req.body);
      const result = await authAccountService.updateManagedUserStatus(req.user, req.params.id, body);

      closeActivitySockets(
        result.closedSessionIds,
        body.isBanned ? "Account has been banned." : "Account status changed. Please login again.",
        body.isBanned ? "banned" : "logout",
      );

      return {
        ok: true,
        forceLogout: result.closedSessionIds.length > 0,
        user: buildUserPayload(result.user),
      };
    }),
  );

  app.post(
    "/api/admin/users/:id/reset-password",
    authenticateToken,
    requireRole("superuser"),
    rateLimiters.adminAction,
    jsonRoute(async (req) => {
      const result = await authAccountService.resetManagedUserPassword(req.user, req.params.id);
      closeActivitySockets(
        result.closedSessionIds,
        "Password reset by superuser. Please login again.",
      );

      return {
        ok: true,
        forceLogout: result.closedSessionIds.length > 0,
        user: buildUserPayload(result.user),
        reset: buildDeliveryPayload(result.reset),
      };
    }),
  );

  app.post(
    "/api/admin/users/:id/resend-activation",
    authenticateToken,
    requireRole("superuser"),
    rateLimiters.adminAction,
    jsonRoute(async (req) => {
      const result = await authAccountService.resendActivation(req.user, req.params.id);
      return {
        ok: true,
        user: buildUserPayload(result.user),
        activation: buildDeliveryPayload(result.activation),
      };
    }),
  );

  app.patch(
    "/api/admin/users/:id/credentials",
    authenticateToken,
    requireRole("superuser"),
    rateLimiters.adminAction,
    jsonRoute(async (req) => {
      const body = readManagedCredentialsBody(req.body);
      if (body.newPassword) {
        throw new AuthAccountError(
          409,
          "ACCOUNT_UNAVAILABLE",
          "Direct password assignment is disabled. Use the reset-password action instead.",
        );
      }

      const user = await authAccountService.updateManagedUser(req.user, req.params.id, {
        username: body.newUsername,
      });

      return {
        ok: true,
        user: buildUserPayload(user),
      };
    }),
  );

  app.post(
    "/api/users",
    authenticateToken,
    requireRole("superuser"),
    rateLimiters.adminAction,
    handleCreateManagedUser,
  );
}

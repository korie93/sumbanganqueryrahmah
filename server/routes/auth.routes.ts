import type { Express, RequestHandler, Response } from "express";
import jwt from "jsonwebtoken";
import { WebSocket } from "ws";
import { getSessionSecret } from "../config/security";
import { sendCredentialError } from "../auth/credentials";
import type { AuthenticatedRequest } from "../auth/guards";
import { asyncHandler } from "../http/async-handler";
import { ensureObject } from "../http/validation";
import { parseBrowser } from "../lib/browser";
import {
  clearDevMailOutbox,
  deleteDevMailPreview,
  isDevMailOutboxEnabled,
  listDevMailPreviews,
  readDevMailPreview,
  renderDevMailPreviewHtml,
} from "../mail/dev-mail-outbox";
import {
  type ManagedAccountActivationDelivery,
  type ManagedAccountPasswordResetDelivery,
  AuthAccountError,
  AuthAccountService,
} from "../services/auth-account.service";
import type { PostgresStorage } from "../storage-postgres";

type AuthRouteDeps = {
  storage: PostgresStorage;
  authenticateToken: RequestHandler;
  requireRole: (...roles: string[]) => RequestHandler;
  connectedClients: Map<string, WebSocket>;
};

type JsonHandler = (
  req: AuthenticatedRequest,
  res: Response,
) => Promise<unknown>;

function buildManagedUserPayload(user: Awaited<ReturnType<PostgresStorage["getManagedUsers"]>>[number]) {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    passwordResetBySuperuser: user.passwordResetBySuperuser,
    createdBy: user.createdBy,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    activatedAt: user.activatedAt,
    lastLoginAt: user.lastLoginAt,
    passwordChangedAt: user.passwordChangedAt,
    isBanned: user.isBanned,
  };
}

function buildUserPayload(user: Awaited<ReturnType<PostgresStorage["getUser"]>>) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    passwordResetBySuperuser: user.passwordResetBySuperuser,
    isBanned: user.isBanned,
    activatedAt: user.activatedAt,
    passwordChangedAt: user.passwordChangedAt,
    lastLoginAt: user.lastLoginAt,
  };
}

function buildDeliveryPayload(
  activation: ManagedAccountActivationDelivery | ManagedAccountPasswordResetDelivery,
) {
  return {
    deliveryMode: activation.deliveryMode,
    errorCode: activation.errorCode,
    errorMessage: activation.errorMessage,
    expiresAt: activation.expiresAt,
    previewUrl: activation.previewUrl,
    recipientEmail: activation.recipientEmail,
    sent: activation.sent,
  };
}

export function registerAuthRoutes(app: Express, deps: AuthRouteDeps) {
  const { storage, authenticateToken, requireRole, connectedClients } = deps;
  const authAccountService = new AuthAccountService(storage);
  const jwtSecret = getSessionSecret();

  const sendAuthError = (res: Response, error: unknown) => {
    if (!(error instanceof AuthAccountError)) {
      return false;
    }

    res.status(error.statusCode).json({
      ok: false,
      message: error.message,
      error: {
        code: error.code,
        message: error.message,
      },
      ...(error.extra || {}),
    });
    return true;
  };

  const jsonRoute = (handler: JsonHandler) =>
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      try {
        const payload = await handler(req, res);
        if (!res.headersSent && payload !== undefined) {
          res.json(payload);
        }
      } catch (error) {
        if (sendAuthError(res, error)) {
          return;
        }
        throw error;
      }
    });

  const closeActivitySockets = (
    activityIds: string[],
    reason: string,
    messageType: "logout" | "banned" = "logout",
  ) => {
    for (const activityId of activityIds) {
      const socket = connectedClients.get(activityId);
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: messageType, reason }));
        socket.close();
      }
      connectedClients.delete(activityId);
      void storage.clearCollectionNicknameSessionByActivity(activityId);
    }
  };

  const handleLogin = jsonRoute(async (req) => {
    const body = ensureObject(req.body) || {};
    const fingerprint = typeof body.fingerprint === "string" ? body.fingerprint : null;
    const pcName = typeof body.pcName === "string" ? body.pcName : null;
    const browser = typeof body.browser === "string" ? body.browser : null;

    const { user, activity } = await authAccountService.login({
      username: String(body.username ?? ""),
      password: String(body.password ?? ""),
      fingerprint,
      pcName,
      browserName: parseBrowser(browser || req.headers["user-agent"]),
      ipAddress: req.ip || req.socket.remoteAddress || null,
    });

    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        role: user.role,
        activityId: activity.id,
      },
      jwtSecret,
      { expiresIn: "24h" },
    );

    return {
      ok: true,
      token,
      username: user.username,
      role: user.role,
      activityId: activity.id,
      mustChangePassword: user.mustChangePassword,
      status: user.status,
      user: buildUserPayload(user),
    };
  });

  app.post("/api/login", handleLogin);
  app.post("/api/auth/login", handleLogin);

  app.get(
    "/dev/mail-preview/:previewId",
    asyncHandler(async (req, res) => {
      if (!isDevMailOutboxEnabled()) {
        return res.status(404).type("text/plain").send("Not found.");
      }

      const preview = await readDevMailPreview(req.params.previewId);
      if (!preview) {
        return res.status(404).type("text/plain").send("Not found.");
      }

      res.setHeader("Cache-Control", "no-store");
      return res.status(200).type("html").send(renderDevMailPreviewHtml(preview));
    }),
  );

  const handleMe = jsonRoute(async (req) => {
    if (!req.user) {
      return sendCredentialError(
        req.res!,
        401,
        "PERMISSION_DENIED",
        "Authentication required.",
      );
    }

    const user = req.user.userId
      ? await storage.getUser(req.user.userId)
      : await storage.getUserByUsername(req.user.username);

    if (!user) {
      return sendCredentialError(req.res!, 404, "USER_NOT_FOUND", "User not found.");
    }

    return buildUserPayload(user);
  });

  app.get("/api/me", authenticateToken, handleMe);
  app.get("/api/auth/me", authenticateToken, jsonRoute(async (req, res) => {
    const payload = await (async () => {
      if (!req.user) {
        return sendCredentialError(res, 401, "PERMISSION_DENIED", "Authentication required.");
      }

      const user = req.user.userId
        ? await storage.getUser(req.user.userId)
        : await storage.getUserByUsername(req.user.username);

      if (!user) {
        return sendCredentialError(res, 404, "USER_NOT_FOUND", "User not found.");
      }

      return { user: buildUserPayload(user) };
    })();

    return payload;
  }));

  app.post("/api/auth/activate-account", jsonRoute(async (req) => {
    const body = ensureObject(req.body) || {};
    const user = await authAccountService.activateAccount({
      username: body.username == null ? undefined : String(body.username),
      token: String(body.token ?? ""),
      newPassword: String(body.newPassword ?? ""),
      confirmPassword: String(body.confirmPassword ?? ""),
    });

    return {
      ok: true,
      user: buildUserPayload(user),
    };
  }));

  app.post("/api/auth/validate-activation-token", jsonRoute(async (req) => {
    const body = ensureObject(req.body) || {};
    const activation = await authAccountService.validateActivationToken(String(body.token ?? ""));
    return {
      ok: true,
      activation,
    };
  }));

  app.post("/api/auth/request-password-reset", jsonRoute(async (req) => {
    const body = ensureObject(req.body) || {};
    const identifier = String(body.identifier ?? body.username ?? body.email ?? "");
    await authAccountService.requestPasswordReset(identifier);
    return {
      ok: true,
      message:
        "If the account exists, the request has been submitted for superuser review.",
    };
  }));

  app.post("/api/auth/validate-password-reset-token", jsonRoute(async (req) => {
    const body = ensureObject(req.body) || {};
    const reset = await authAccountService.validatePasswordResetToken(String(body.token ?? ""));
    return {
      ok: true,
      reset,
    };
  }));

  app.post("/api/auth/reset-password-with-token", jsonRoute(async (req) => {
    const body = ensureObject(req.body) || {};
    const user = await authAccountService.resetPasswordWithToken({
      token: String(body.token ?? ""),
      newPassword: String(body.newPassword ?? ""),
      confirmPassword: String(body.confirmPassword ?? ""),
    });

    return {
      ok: true,
      user: buildUserPayload(user),
    };
  }));

  app.post("/api/auth/change-password", authenticateToken, jsonRoute(async (req) => {
    const body = ensureObject(req.body) || {};
    const result = await authAccountService.changeOwnPassword(req.user, {
      currentPassword: String(body.currentPassword ?? ""),
      newPassword: String(body.newPassword ?? ""),
    });

    closeActivitySockets(
      result.closedSessionIds,
      "Password changed. Please login again.",
    );

    return {
      ok: true,
      forceLogout: true,
      user: buildUserPayload(result.user),
    };
  }));

  app.patch("/api/me/credentials", authenticateToken, jsonRoute(async (req) => {
    if (!req.user) {
      throw new AuthAccountError(401, "PERMISSION_DENIED", "Authentication required.");
    }

    const body = ensureObject(req.body) || {};
    const hasUsernameField = Object.prototype.hasOwnProperty.call(body, "newUsername");
    const hasPasswordField =
      Object.prototype.hasOwnProperty.call(body, "newPassword")
      || Object.prototype.hasOwnProperty.call(body, "currentPassword");

    if (!hasUsernameField && !hasPasswordField) {
      const user = req.user.userId
        ? await storage.getUser(req.user.userId)
        : await storage.getUserByUsername(req.user.username);

      return {
        ok: true,
        forceLogout: false,
        user: buildUserPayload(user),
      };
    }

    if (req.user.mustChangePassword && !hasPasswordField) {
      throw new AuthAccountError(
        403,
        "PASSWORD_CHANGE_REQUIRED",
        "Password change is required before other account updates.",
      );
    }

    let updatedUser = req.user.userId
      ? await storage.getUser(req.user.userId)
      : await storage.getUserByUsername(req.user.username);
    let forceLogout = false;

    if (hasUsernameField) {
      updatedUser = await authAccountService.changeOwnUsername(
        req.user,
        String(body.newUsername ?? ""),
      );
    }

    if (hasPasswordField) {
      const result = await authAccountService.changeOwnPassword(req.user, {
        currentPassword: String(body.currentPassword ?? ""),
        newPassword: String(body.newPassword ?? ""),
      });
      closeActivitySockets(
        result.closedSessionIds,
        "Password changed. Please login again.",
      );
      updatedUser = result.user;
      forceLogout = true;
    }

    return {
      ok: true,
      forceLogout,
      user: buildUserPayload(updatedUser),
    };
  }));

  app.get(
    "/api/admin/users",
    authenticateToken,
    requireRole("superuser"),
    jsonRoute(async (req) => {
      const users = await authAccountService.getManagedUsers(req.user);
      return {
        ok: true,
        users: users.map((user) => buildManagedUserPayload(user)),
      };
    }),
  );

  app.post(
    "/api/admin/users",
    authenticateToken,
    requireRole("superuser"),
    jsonRoute(async (req) => {
      const body = ensureObject(req.body) || {};
      const result = await authAccountService.createManagedUser(req.user, {
        username: String(body.username ?? ""),
        fullName: body.fullName == null ? null : String(body.fullName),
        email: body.email == null ? null : String(body.email),
        role: String(body.role ?? "user"),
      });

      return {
        ok: true,
        user: buildUserPayload(result.user),
        activation: buildDeliveryPayload(result.activation),
      };
    }),
  );

  app.patch(
    "/api/admin/users/:id",
    authenticateToken,
    requireRole("superuser"),
    jsonRoute(async (req) => {
      const body = ensureObject(req.body) || {};
      const user = await authAccountService.updateManagedUser(req.user, req.params.id, {
        username: body.username !== undefined ? String(body.username) : undefined,
        fullName: body.fullName !== undefined ? String(body.fullName ?? "") : undefined,
        email: body.email !== undefined ? String(body.email ?? "") : undefined,
      });

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
    jsonRoute(async (req) => {
      const body = ensureObject(req.body) || {};
      const result = await authAccountService.updateManagedUserRole(
        req.user,
        req.params.id,
        String(body.role ?? ""),
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
    jsonRoute(async (req) => {
      const body = ensureObject(req.body) || {};
      const isBanned =
        body.isBanned === undefined ? undefined : Boolean(body.isBanned);
      const result = await authAccountService.updateManagedUserStatus(req.user, req.params.id, {
        status: body.status !== undefined ? String(body.status) : undefined,
        isBanned,
      });

      closeActivitySockets(
        result.closedSessionIds,
        isBanned ? "Account has been banned." : "Account status changed. Please login again.",
        isBanned ? "banned" : "logout",
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
    jsonRoute(async (req) => {
      const result = await authAccountService.resendActivation(req.user, req.params.id);
      return {
        ok: true,
        user: buildUserPayload(result.user),
        activation: buildDeliveryPayload(result.activation),
      };
    }),
  );

  app.get(
    "/api/admin/password-reset-requests",
    authenticateToken,
    requireRole("superuser"),
    jsonRoute(async (req) => {
      const requests = await authAccountService.listPendingPasswordResetRequests(req.user);
      return {
        ok: true,
        requests,
      };
    }),
  );

  app.get(
    "/api/admin/dev-mail-outbox",
    authenticateToken,
    requireRole("superuser"),
    jsonRoute(async () => {
      return {
        ok: true,
        enabled: isDevMailOutboxEnabled(),
        previews: await listDevMailPreviews(25),
      };
    }),
  );

  app.delete(
    "/api/admin/dev-mail-outbox/:previewId",
    authenticateToken,
    requireRole("superuser"),
    jsonRoute(async (req) => {
      const deleted = await deleteDevMailPreview(req.params.previewId);
      if (!deleted) {
        throw new AuthAccountError(404, "MAIL_PREVIEW_NOT_FOUND", "Mail preview not found.");
      }

      if (req.user) {
        await storage.createAuditLog({
          action: "DEV_MAIL_OUTBOX_ENTRY_DELETED",
          performedBy: req.user.username,
          targetResource: req.params.previewId,
          details: "Local mail outbox preview deleted.",
        });
      }

      return {
        ok: true,
        deleted: true,
      };
    }),
  );

  app.delete(
    "/api/admin/dev-mail-outbox",
    authenticateToken,
    requireRole("superuser"),
    jsonRoute(async (req) => {
      const deletedCount = await clearDevMailOutbox();

      if (req.user) {
        await storage.createAuditLog({
          action: "DEV_MAIL_OUTBOX_CLEARED",
          performedBy: req.user.username,
          details: JSON.stringify({
            metadata: {
              deleted_count: deletedCount,
            },
          }),
        });
      }

      return {
        ok: true,
        deletedCount,
      };
    }),
  );

  app.patch(
    "/api/admin/users/:id/credentials",
    authenticateToken,
    requireRole("superuser"),
    jsonRoute(async (req) => {
      const body = ensureObject(req.body) || {};
      const newPassword = String(body.newPassword ?? "");
      if (newPassword) {
        throw new AuthAccountError(
          409,
          "ACCOUNT_UNAVAILABLE",
          "Direct password assignment is disabled. Use the reset-password action instead.",
        );
      }

      const user = await authAccountService.updateManagedUser(req.user, req.params.id, {
        username: body.newUsername !== undefined ? String(body.newUsername) : undefined,
      });

      return {
        ok: true,
        user: buildUserPayload(user),
      };
    }),
  );

  app.get(
    "/api/accounts",
    authenticateToken,
    requireRole("superuser"),
    asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
      const accounts = await storage.getAccounts();
      res.json(accounts);
    }),
  );

  app.post(
    "/api/users",
    authenticateToken,
    requireRole("superuser"),
    jsonRoute(async (req) => {
      const body = ensureObject(req.body) || {};
      const result = await authAccountService.createManagedUser(req.user, {
        username: String(body.username ?? ""),
        fullName: body.fullName == null ? null : String(body.fullName),
        email: body.email == null ? null : String(body.email),
        role: String(body.role ?? "user"),
      });

      return {
        ok: true,
        user: buildUserPayload(result.user),
        activation: buildDeliveryPayload(result.activation),
      };
    }),
  );
}

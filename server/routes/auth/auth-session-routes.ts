import { asyncHandler } from "../../http/async-handler";
import type { AuthenticatedRequest } from "../../auth/guards";
import { AuthAccountError } from "../../services/auth-account.service";
import {
  readLoginBody,
  readOwnCredentialPatchBody,
  readPasswordChangeBody,
} from "./auth-request-parsers";
import type { AuthRouteContext } from "./auth-route-shared";

export function registerAuthSessionRoutes(context: AuthRouteContext) {
  const {
    app,
    storage,
    authAccountService,
    authenticateToken,
    rateLimiters,
    jsonRoute,
    closeActivitySockets,
    buildUserPayload,
    buildOkPayload,
    signSessionToken,
    parseBrowserName,
  } = context;

  const handleLogin = jsonRoute(async (req, res) => {
    const body = readLoginBody(req.body);
    const { user, activity } = await authAccountService.login({
      username: body.username,
      password: body.password,
      fingerprint: body.fingerprint,
      pcName: body.pcName,
      browserName: parseBrowserName(body.browser, req.headers["user-agent"]),
      ipAddress: req.ip || req.socket.remoteAddress || null,
    });

    signSessionToken(
      {
        userId: user.id,
        username: user.username,
        role: user.role,
        activityId: activity.id,
      },
      res,
    );

    return {
      ok: true,
      username: user.username,
      role: user.role,
      activityId: activity.id,
      mustChangePassword: user.mustChangePassword,
      status: user.status,
      user: buildUserPayload(user),
    };
  });

  app.post("/api/login", rateLimiters.login, handleLogin);
  app.post("/api/auth/login", rateLimiters.login, handleLogin);

  const handleMe = jsonRoute(async (req) => {
    if (!req.user) {
      throw new AuthAccountError(401, "PERMISSION_DENIED", "Authentication required.");
    }

    const user = req.user.userId
      ? await storage.getUser(req.user.userId)
      : await storage.getUserByUsername(req.user.username);

    if (!user) {
      throw new AuthAccountError(404, "USER_NOT_FOUND", "User not found.");
    }

    return buildOkPayload({
      user: buildUserPayload(user),
    });
  });

  app.get("/api/me", authenticateToken, handleMe);
  app.get("/api/auth/me", authenticateToken, handleMe);

  app.post(
    "/api/auth/change-password",
    authenticateToken,
    rateLimiters.authenticatedAuth,
    jsonRoute(async (req) => {
      const body = readPasswordChangeBody(req.body);
      const result = await authAccountService.changeOwnPassword(req.user, body);

      closeActivitySockets(
        result.closedSessionIds,
        "Password changed. Please login again.",
      );

      return {
        ok: true,
        forceLogout: true,
        user: buildUserPayload(result.user),
      };
    }),
  );

  app.patch(
    "/api/me/credentials",
    authenticateToken,
    rateLimiters.authenticatedAuth,
    jsonRoute(async (req) => {
      if (!req.user) {
        throw new AuthAccountError(401, "PERMISSION_DENIED", "Authentication required.");
      }

      const parsed = readOwnCredentialPatchBody(req.body);
      if (!parsed.hasUsernameField && !parsed.hasPasswordField) {
        const user = req.user.userId
          ? await storage.getUser(req.user.userId)
          : await storage.getUserByUsername(req.user.username);

        return {
          ok: true,
          forceLogout: false,
          user: buildUserPayload(user),
        };
      }

      if (req.user.mustChangePassword && !parsed.hasPasswordField) {
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

      if (parsed.hasUsernameField) {
        updatedUser = await authAccountService.changeOwnUsername(
          req.user,
          parsed.newUsername ?? "",
        );
      }

      if (parsed.hasPasswordField) {
        const result = await authAccountService.changeOwnPassword(req.user, {
          currentPassword: parsed.currentPassword,
          newPassword: parsed.newPassword,
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
    }),
  );
}

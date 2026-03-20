import {
  readLoginBody,
  readOwnCredentialPatchBody,
  readPasswordChangeBody,
} from "./auth-request-parsers";
import type { AuthRouteContext } from "./auth-route-shared";

export function registerAuthSessionRoutes(context: AuthRouteContext) {
  const {
    app,
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
    const user = await authAccountService.getCurrentUser(req.user);
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
      const parsed = readOwnCredentialPatchBody(req.body);
      const result = await authAccountService.updateOwnCredentials(req.user, parsed);
      if (result.forceLogout) {
        closeActivitySockets(
          result.closedSessionIds,
          "Password changed. Please login again.",
        );
      }

      return {
        ok: true,
        forceLogout: result.forceLogout,
        user: buildUserPayload(result.user),
      };
    }),
  );
}

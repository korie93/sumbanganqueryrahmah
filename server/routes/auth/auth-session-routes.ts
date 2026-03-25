import {
  readLoginBody,
  readOwnCredentialPatchBody,
  readPasswordChangeBody,
  readTwoFactorChallengeBody,
  readTwoFactorCodeBody,
  readTwoFactorDisableBody,
  readTwoFactorSetupBody,
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
    signTwoFactorChallengeToken,
    verifyTwoFactorChallengeToken,
    parseBrowserName,
  } = context;

  const handleLogin = jsonRoute(async (req, res) => {
    const body = readLoginBody(req.body);
    const loginResult = await authAccountService.login({
      username: body.username,
      password: body.password,
      fingerprint: body.fingerprint,
      pcName: body.pcName,
      browserName: parseBrowserName(body.browser, req.headers["user-agent"]),
      ipAddress: req.ip || req.socket.remoteAddress || null,
    });

    if (loginResult.kind === "two_factor_required") {
      return {
        ok: true,
        twoFactorRequired: true,
        challengeToken: signTwoFactorChallengeToken({
          userId: loginResult.user.id,
          username: loginResult.user.username,
          role: loginResult.user.role,
          fingerprint: body.fingerprint,
          browserName: parseBrowserName(body.browser, req.headers["user-agent"]),
          pcName: body.pcName,
          ipAddress: req.ip || req.socket.remoteAddress || null,
        }),
        username: loginResult.user.username,
        role: loginResult.user.role,
        mustChangePassword: loginResult.user.mustChangePassword,
        status: loginResult.user.status,
        user: buildUserPayload(loginResult.user),
      };
    }

    const { user, activity } = loginResult;

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

  app.post(
    "/api/auth/verify-two-factor-login",
    rateLimiters.login,
    jsonRoute(async (req, res) => {
      const body = readTwoFactorChallengeBody(req.body);
      const challenge = verifyTwoFactorChallengeToken(body.challengeToken);
      const result = await authAccountService.verifyTwoFactorLogin({
        userId: challenge.userId,
        code: body.code,
        fingerprint: challenge.fingerprint,
        browserName: challenge.browserName,
        pcName: challenge.pcName,
        ipAddress: challenge.ipAddress,
      });

      signSessionToken(
        {
          userId: result.user.id,
          username: result.user.username,
          role: result.user.role,
          activityId: result.activity.id,
        },
        res,
      );

      return {
        ok: true,
        username: result.user.username,
        role: result.user.role,
        activityId: result.activity.id,
        mustChangePassword: result.user.mustChangePassword,
        status: result.user.status,
        user: buildUserPayload(result.user),
      };
    }),
  );

  const handleMe = jsonRoute(async (req) => {
    const user = await authAccountService.getCurrentUser(req.user);
    return buildOkPayload({
      user: buildUserPayload(user),
    });
  });

  app.get("/api/me", authenticateToken, handleMe);
  app.get("/api/auth/me", authenticateToken, handleMe);

  app.get(
    "/api/auth/two-factor",
    authenticateToken,
    rateLimiters.authenticatedAuth,
    jsonRoute(async (req) => {
      const user = await authAccountService.getCurrentUser(req.user);
      return buildOkPayload({
        twoFactor: {
          enabled: user.twoFactorEnabled === true,
          pendingSetup: Boolean(user.twoFactorSecretEncrypted) && user.twoFactorEnabled !== true,
          configuredAt: user.twoFactorConfiguredAt ?? null,
        },
        user: buildUserPayload(user),
      });
    }),
  );

  app.post(
    "/api/auth/two-factor/setup",
    authenticateToken,
    rateLimiters.authenticatedAuth,
    jsonRoute(async (req) => {
      const body = readTwoFactorSetupBody(req.body);
      const result = await authAccountService.startTwoFactorSetup(req.user, body);
      return buildOkPayload({
        setup: result.setup,
        user: buildUserPayload(result.user),
      });
    }),
  );

  app.post(
    "/api/auth/two-factor/enable",
    authenticateToken,
    rateLimiters.authenticatedAuth,
    jsonRoute(async (req) => {
      const body = readTwoFactorCodeBody(req.body);
      const user = await authAccountService.confirmTwoFactorSetup(req.user, body);
      return buildOkPayload({
        user: buildUserPayload(user),
      });
    }),
  );

  app.post(
    "/api/auth/two-factor/disable",
    authenticateToken,
    rateLimiters.authenticatedAuth,
    jsonRoute(async (req) => {
      const body = readTwoFactorDisableBody(req.body);
      const user = await authAccountService.disableTwoFactor(req.user, body);
      return buildOkPayload({
        user: buildUserPayload(user),
      });
    }),
  );

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

import {
  readLoginBody,
  readTwoFactorChallengeBody,
} from "./auth-request-parsers";
import type { AuthRouteContext } from "./auth-route-shared";

export function registerAuthLoginRoutes(context: AuthRouteContext) {
  const {
    app,
    authAccountService,
    rateLimiters,
    jsonRoute,
    closeActivitySockets,
    buildUserPayload,
    signSessionToken,
    signTwoFactorChallengeToken,
    signTwoFactorSetupChallengeToken,
    verifyTwoFactorChallengeToken,
    verifyTwoFactorSetupChallengeToken,
    parseBrowserName,
  } = context;

  const handleLogin = jsonRoute(async (req, res) => {
    const body = readLoginBody(req.body);
    const browserName = parseBrowserName(body.browser, req.headers["user-agent"]);
    const ipAddress = req.ip || req.socket.remoteAddress || null;
    const loginResult = await authAccountService.login({
      username: body.username,
      password: body.password,
      fingerprint: body.fingerprint,
      pcName: body.pcName,
      browserName,
      ipAddress,
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
          browserName,
          pcName: body.pcName,
          ipAddress,
        }),
        username: loginResult.user.username,
        role: loginResult.user.role,
        mustChangePassword: loginResult.user.mustChangePassword,
        status: loginResult.user.status,
        user: buildUserPayload(loginResult.user),
      };
    }

    if (loginResult.kind === "two_factor_setup_required") {
      return {
        ok: true,
        twoFactorSetupRequired: true,
        challengeToken: signTwoFactorSetupChallengeToken({
          userId: loginResult.user.id,
          username: loginResult.user.username,
          role: loginResult.user.role,
          fingerprint: body.fingerprint,
          browserName,
          pcName: body.pcName,
          ipAddress,
        }),
        username: loginResult.user.username,
        role: loginResult.user.role,
        mustChangePassword: loginResult.user.mustChangePassword,
        status: loginResult.user.status,
        setup: loginResult.setup,
        user: buildUserPayload(loginResult.user),
      };
    }

    const { user, activity, closedSessionIds } = loginResult;

    signSessionToken(
      {
        userId: user.id,
        username: user.username,
        role: user.role,
        activityId: activity.id,
      },
      res,
    );

    closeActivitySockets(
      closedSessionIds,
      "Your account was opened in another browser or device. Please login again.",
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

  app.post("/api/login", rateLimiters.loginIp, rateLimiters.login, handleLogin);
  app.post("/api/auth/login", rateLimiters.loginIp, rateLimiters.login, handleLogin);

  app.post(
    "/api/auth/complete-login-two-factor-setup",
    rateLimiters.loginIp,
    rateLimiters.login,
    jsonRoute(async (req, res) => {
      const body = readTwoFactorChallengeBody(req.body);
      const challenge = verifyTwoFactorSetupChallengeToken(body.challengeToken);
      const result = await authAccountService.completeLoginTwoFactorSetup({
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

      closeActivitySockets(
        result.closedSessionIds,
        "Your account was opened in another browser or device. Please login again.",
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

  app.post(
    "/api/auth/verify-two-factor-login",
    rateLimiters.loginIp,
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

      closeActivitySockets(
        result.closedSessionIds,
        "Your account was opened in another browser or device. Please login again.",
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
}

import {
  readLoginBody,
  readTwoFactorChallengeBody,
} from "./auth-request-parsers";
import { logger } from "../../lib/logger";
import type { AuthRouteContext } from "./auth-route-shared";

const LEGACY_LOGIN_ROUTE = "/api/login";
const CANONICAL_LOGIN_ROUTE = "/api/auth/login";
const LEGACY_LOGIN_ROUTE_SUNSET = "Thu, 31 Dec 2026 23:59:59 GMT";

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
    verifyTwoFactorChallengeToken,
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

    const { user, activity, closedSessionIds } = loginResult;

    const session = signSessionToken(
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
      sessionExpiresAt: session.expiresAt,
    };
  });

  app.post(
    LEGACY_LOGIN_ROUTE,
    (req, res, next) => {
      res.setHeader("Deprecation", "true");
      res.setHeader("Sunset", LEGACY_LOGIN_ROUTE_SUNSET);
      res.setHeader("Link", `<${CANONICAL_LOGIN_ROUTE}>; rel="successor-version"`);
      logger.warn("Deprecated auth login route used", {
        legacyRoute: req.path,
        canonicalRoute: CANONICAL_LOGIN_ROUTE,
        monitorRouteGroup: "auth.login",
        sunsetAt: LEGACY_LOGIN_ROUTE_SUNSET,
      });
      next();
    },
    rateLimiters.loginIp,
    rateLimiters.login,
    handleLogin,
  );
  app.post(CANONICAL_LOGIN_ROUTE, rateLimiters.loginIp, rateLimiters.login, handleLogin);

  app.post(
    "/api/auth/verify-two-factor-login",
    rateLimiters.twoFactorLogin,
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

      const session = signSessionToken(
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
        sessionExpiresAt: session.expiresAt,
      };
    }),
  );
}

import {
  readOwnCredentialPatchBody,
  readPasswordChangeBody,
  readTwoFactorCodeBody,
  readTwoFactorDisableBody,
  readTwoFactorSetupBody,
} from "./auth-request-parsers";
import { clearAuthSessionCookie } from "../../auth/session-cookie";
import { rotateCsrfTokenAfterPrivilegeEscalation } from "../../http/csrf";
import type { AuthRouteContext } from "./auth-route-shared";

export function registerAuthSelfServiceRoutes(context: AuthRouteContext) {
  const {
    app,
    authAccountService,
    authenticateToken,
    rateLimiters,
    jsonRoute,
    closeActivitySockets,
    buildUserPayload,
    buildOkPayload,
  } = context;

  const handleMe = jsonRoute(async (req) => {
    const user = await authAccountService.getCurrentUser(req.user);
    return buildOkPayload({
      user: buildUserPayload(user),
      sessionExpiresAt: req.user?.sessionExpiresAt ?? null,
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
    rateLimiters.twoFactorManagement,
    rateLimiters.authenticatedAuth,
    jsonRoute(async (req, res) => {
      const body = readTwoFactorSetupBody(req.body);
      const result = await authAccountService.startTwoFactorSetup(req.user, body);
      rotateCsrfTokenAfterPrivilegeEscalation(res, {
        reason: "two_factor_setup_started",
        route: req.path,
      });
      return buildOkPayload({
        setup: result.setup,
        user: buildUserPayload(result.user),
      });
    }),
  );

  app.post(
    "/api/auth/two-factor/enable",
    authenticateToken,
    rateLimiters.twoFactorManagement,
    rateLimiters.authenticatedAuth,
    jsonRoute(async (req, res) => {
      const body = readTwoFactorCodeBody(req.body);
      const user = await authAccountService.confirmTwoFactorSetup(req.user, body);
      rotateCsrfTokenAfterPrivilegeEscalation(res, {
        reason: "two_factor_enabled",
        route: req.path,
      });
      return buildOkPayload({
        user: buildUserPayload(user),
      });
    }),
  );

  app.post(
    "/api/auth/two-factor/disable",
    authenticateToken,
    rateLimiters.twoFactorManagement,
    rateLimiters.authenticatedAuth,
    jsonRoute(async (req, res) => {
      const body = readTwoFactorDisableBody(req.body);
      const user = await authAccountService.disableTwoFactor(req.user, body);
      rotateCsrfTokenAfterPrivilegeEscalation(res, {
        reason: "two_factor_disabled",
        route: req.path,
      });
      return buildOkPayload({
        user: buildUserPayload(user),
      });
    }),
  );

  app.post(
    "/api/auth/change-password",
    authenticateToken,
    rateLimiters.authenticatedAuth,
    jsonRoute(async (req, res) => {
      const body = readPasswordChangeBody(req.body);
      const result = await authAccountService.changeOwnPassword(req.user, body);

      closeActivitySockets(
        result.closedSessionIds,
        "Password changed. Please login again.",
      );
      clearAuthSessionCookie(res);

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
    jsonRoute(async (req, res) => {
      const parsed = readOwnCredentialPatchBody(req.body);
      const result = await authAccountService.updateOwnCredentials(req.user, parsed);
      if (result.forceLogout) {
        closeActivitySockets(
          result.closedSessionIds,
          "Password changed. Please login again.",
        );
        clearAuthSessionCookie(res);
      } else {
        rotateCsrfTokenAfterPrivilegeEscalation(res, {
          reason: "own_credentials_updated",
          route: req.path,
        });
      }

      return {
        ok: true,
        forceLogout: result.forceLogout,
        user: buildUserPayload(result.user),
      };
    }),
  );
}

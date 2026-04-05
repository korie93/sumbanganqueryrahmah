import {
  readActivationBody,
  readPasswordResetRequestBody,
  readTokenBody,
} from "./auth-request-parsers";
import type { AuthRouteContext } from "./auth-route-shared";

export function registerAuthPublicRecoveryRoutes(context: AuthRouteContext) {
  const {
    app,
    authAccountService,
    rateLimiters,
    jsonRoute,
    buildUserPayload,
  } = context;

  app.post("/api/auth/activate-account", rateLimiters.publicRecovery, jsonRoute(async (req) => {
    const body = readActivationBody(req.body);
    const user = await authAccountService.activateAccount(body);

    return {
      ok: true,
      user: buildUserPayload(user),
    };
  }));

  app.post("/api/auth/validate-activation-token", rateLimiters.publicRecovery, jsonRoute(async (req) => {
    const body = readTokenBody(req.body);
    const activation = await authAccountService.validateActivationToken(body.token);
    return {
      ok: true,
      activation,
    };
  }));

  app.post("/api/auth/request-password-reset", rateLimiters.publicRecovery, jsonRoute(async (req) => {
    const body = readPasswordResetRequestBody(req.body);
    await authAccountService.requestPasswordReset(body.identifier);
    return {
      ok: true,
      message:
        "If the account exists, the request has been submitted for superuser review.",
    };
  }));

  app.post("/api/auth/validate-password-reset-token", rateLimiters.publicRecovery, jsonRoute(async (req) => {
    const body = readTokenBody(req.body);
    const reset = await authAccountService.validatePasswordResetToken(body.token);
    return {
      ok: true,
      reset,
    };
  }));

  app.post("/api/auth/reset-password-with-token", rateLimiters.publicRecovery, jsonRoute(async (req) => {
    const body = readActivationBody(req.body);
    const user = await authAccountService.resetPasswordWithToken(body);

    return {
      ok: true,
      user: buildUserPayload(user),
    };
  }));
}

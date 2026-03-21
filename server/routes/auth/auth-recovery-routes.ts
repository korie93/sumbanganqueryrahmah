import { asyncHandler } from "../../http/async-handler";
import {
  readActivationBody,
  readPasswordResetRequestBody,
  readTokenBody,
} from "./auth-request-parsers";
import type { AuthRouteContext } from "./auth-route-shared";

function isLoopbackHost(hostname: string): boolean {
  const normalized = String(hostname || "").trim().toLowerCase();
  return normalized === "127.0.0.1" || normalized === "localhost" || normalized === "::1";
}

function isLoopbackRemoteAddress(remoteAddress: string): boolean {
  const normalized = String(remoteAddress || "").trim().toLowerCase();
  return normalized === "127.0.0.1"
    || normalized === "::1"
    || normalized === "::ffff:127.0.0.1";
}

export function registerAuthRecoveryRoutes(context: AuthRouteContext) {
  const {
    app,
    authAccountService,
    authenticateToken,
    requireRole,
    rateLimiters,
    jsonRoute,
    buildUserPayload,
    buildDeliveryPayload,
  } = context;

  app.get(
    "/dev/mail-preview/:previewId",
    asyncHandler(async (req, res) => {
      if (String(process.env.NODE_ENV || "").trim().toLowerCase() === "production") {
        return res.status(404).type("text/plain").send("Not found.");
      }

      const host = String(req.hostname || "");
      const remoteAddress = String(req.socket?.remoteAddress || "");
      if (!isLoopbackHost(host) || !isLoopbackRemoteAddress(remoteAddress)) {
        return res.status(404).type("text/plain").send("Not found.");
      }

      const html = await authAccountService.getDevMailPreviewHtml(req.params.previewId);
      if (!html) {
        return res.status(404).type("text/plain").send("Not found.");
      }

      res.setHeader("Cache-Control", "no-store");
      return res.status(200).type("html").send(html);
    }),
  );

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

  app.get(
    "/api/admin/dev-mail-outbox",
    authenticateToken,
    requireRole("superuser"),
    rateLimiters.adminAction,
    jsonRoute(async (req) => {
      const result = await authAccountService.listDevMailOutbox(req.user);
      return {
        ok: true,
        enabled: result.enabled,
        previews: result.previews,
      };
    }),
  );

  app.delete(
    "/api/admin/dev-mail-outbox/:previewId",
    authenticateToken,
    requireRole("superuser"),
    rateLimiters.adminAction,
    jsonRoute(async (req) => {
      const result = await authAccountService.deleteDevMailPreview(req.user, req.params.previewId);
      return {
        ok: true,
        deleted: result.deleted,
      };
    }),
  );

  app.delete(
    "/api/admin/dev-mail-outbox",
    authenticateToken,
    requireRole("superuser"),
    rateLimiters.adminAction,
    jsonRoute(async (req) => {
      const result = await authAccountService.clearDevMailOutbox(req.user);
      return {
        ok: true,
        deletedCount: result.deletedCount,
      };
    }),
  );
}

import { asyncHandler } from "../../http/async-handler";
import {
  clearDevMailOutbox,
  deleteDevMailPreview,
  isDevMailOutboxEnabled,
  listDevMailPreviews,
  readDevMailPreview,
  renderDevMailPreviewHtml,
} from "../../mail/dev-mail-outbox";
import { AuthAccountError } from "../../services/auth-account.service";
import {
  readActivationBody,
  readPasswordResetRequestBody,
  readTokenBody,
} from "./auth-request-parsers";
import type { AuthRouteContext } from "./auth-route-shared";

export function registerAuthRecoveryRoutes(context: AuthRouteContext) {
  const {
    app,
    storage,
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
    rateLimiters.adminAction,
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
    rateLimiters.adminAction,
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
}

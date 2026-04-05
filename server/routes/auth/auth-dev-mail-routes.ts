import { asyncHandler } from "../../http/async-handler";
import { isStrictLocalDevelopmentEnvironment } from "../../config/runtime-environment";
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

export function registerAuthDevMailRoutes(context: AuthRouteContext) {
  const {
    app,
    authAccountService,
    authenticateToken,
    requireRole,
    rateLimiters,
    jsonRoute,
  } = context;

  app.get(
    "/dev/mail-preview/:previewId",
    asyncHandler(async (req, res) => {
      if (!isStrictLocalDevelopmentEnvironment()) {
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

  app.get(
    "/api/admin/dev-mail-outbox",
    authenticateToken,
    requireRole("superuser"),
    rateLimiters.adminAction,
    jsonRoute(async (req) => {
      const result = await authAccountService.listDevMailOutbox(
        req.user,
        req.query as Record<string, unknown>,
      );
      return {
        ok: true,
        enabled: result.enabled,
        previews: result.previews,
        pagination: result.pagination,
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

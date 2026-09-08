import { z } from "zod";
import type { AuthenticatedRequest } from "../auth/guards";
import { asyncHandler } from "../http/async-handler";
import { parseRequestBody } from "../http/validation";
import type { SettingsRouteContext } from "./settings-route-context";

const settingsPatchBodySchema = z.object({
  key: z.string().trim().min(1, "Invalid setting key"),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  confirmCritical: z.boolean().optional(),
});
const rolePermissionsPatchBodySchema = z.object({
  updates: z.array(z.object({ key: z.string().trim().min(1).max(100), value: z.boolean() }).strict()).min(1).max(50),
  confirmCritical: z.boolean().optional(),
}).strict();

function buildSettingsSuccessPayload<T extends Record<string, unknown>>(payload: T) {
  return {
    ok: true as const,
    ...payload,
  };
}

function buildSettingsErrorPayload(
  message: string,
  extra?: Record<string, unknown>,
) {
  return {
    ok: false as const,
    message,
    ...(extra ?? {}),
  };
}

export function registerSettingsMutationRoutes(context: SettingsRouteContext) {
  const {
    app,
    authenticateToken,
    requireRole,
    requireTabAccess,
    settingsService,
  } = context;

  app.patch("/api/settings/role-permissions", authenticateToken, requireRole("superuser"), requireTabAccess("settings"),
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const body = parseRequestBody(rolePermissionsPatchBodySchema, req.body);
      const result = await settingsService.updateRolePermissions({
        role: req.user!.role, updatedBy: req.user!.username,
        updates: body.updates, confirmCritical: body.confirmCritical === true,
      });
      const codes: Record<string, number> = { not_found: 404, forbidden: 403, requires_confirmation: 409, invalid: 400 };
      const code = codes[result.status];
      if (code) return res.status(code).json(buildSettingsErrorPayload(result.message,
        result.status === "requires_confirmation" ? { requiresConfirmation: true } : undefined));
      return res.json(buildSettingsSuccessPayload({ success: true, status: result.status, message: result.message, setting: null }));
    }),
  );

  app.patch(
    "/api/settings",
    authenticateToken,
    requireRole("admin", "superuser"),
    requireTabAccess("settings"),
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const body = parseRequestBody(settingsPatchBodySchema, req.body);
      const role = req.user?.role || "user";
      const result = await settingsService.updateSetting({
        role,
        key: body.key,
        value: body.value,
        confirmCritical: body.confirmCritical === true,
        updatedBy: req.user?.username || "system",
      });

      if (result.status === "not_found") {
        return res.status(404).json(buildSettingsErrorPayload(result.message));
      }
      if (result.status === "forbidden") {
        return res.status(403).json(buildSettingsErrorPayload(result.message));
      }
      if (result.status === "requires_confirmation") {
        return res.status(409).json(
          buildSettingsErrorPayload(result.message, { requiresConfirmation: true }),
        );
      }
      if (result.status === "invalid") {
        return res.status(400).json(buildSettingsErrorPayload(result.message));
      }

      return res.json(buildSettingsSuccessPayload({
        success: result.status === "updated" || result.status === "unchanged",
        status: result.status,
        message: result.message,
        setting: result.setting || null,
      }));
    }),
  );
}

import { z } from "zod";
import { ACCOUNT_AVATAR_ENDPOINT } from "../../../shared/account-avatar";
import { parseRequestBody } from "../../http/validation";
import type { AuthRouteContext } from "./auth-route-shared";

const avatarQuerySchema = z.object({ v: z.string().regex(/^[a-f0-9]{24}$/).optional() }).strict();

export function registerAccountAvatarRoutes(context: AuthRouteContext) {
  const { app, authenticateToken, accountAvatarService, rateLimiters, jsonRoute, buildCurrentUserPayload } = context;
  app.get(ACCOUNT_AVATAR_ENDPOINT, authenticateToken, jsonRoute(async (req, res) => {
    parseRequestBody(avatarQuerySchema, req.query);
    const image = await accountAvatarService.read(req.user);
    res.set({
      "Content-Type": image.mimeType,
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "same-origin",
    });
    res.send(image.buffer);
  }));
  app.put(ACCOUNT_AVATAR_ENDPOINT, authenticateToken, rateLimiters.authenticatedAuth, jsonRoute(async (req) => {
    parseRequestBody(z.object({}).strict(), req.query);
    const user = await accountAvatarService.update(req.user, req.body);
    return { ok: true, user: await buildCurrentUserPayload(user) };
  }));
}

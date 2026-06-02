import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/guards";
import {
  clearAuthSessionCookie,
  readAuthSessionTokenFromHeaders,
} from "../auth/session-cookie";
import { revokeSessionJwt } from "../auth/session-revocation-store";
import { asyncHandler } from "../http/async-handler";
import { readQueryObject } from "../http/validation";
import {
  buildActivityErrorPayload,
  buildActivityFilters,
  buildActivitySuccessPayload,
  readActivityBodyObject,
  type ActivityRouteContext,
} from "./activity-route-context";

type LogoutJwtRevocationClaims = {
  jwtId: string;
  expiresAtMs: number;
};

function readLogoutJwtClaimsFromToken(token: string): LogoutJwtRevocationClaims | null {
  const [, payloadSegment] = String(token || "").split(".");
  if (!payloadSegment) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadSegment, "base64url").toString("utf8")) as {
      exp?: unknown;
      jti?: unknown;
    };
    const jwtId = String(payload.jti || "").trim();
    if (!jwtId) {
      return null;
    }

    const expSeconds = Number(payload.exp);
    const expiresAtMs = Number.isFinite(expSeconds) && expSeconds > 0 ? expSeconds * 1000 : 0;
    return { jwtId, expiresAtMs };
  } catch {
    return null;
  }
}

function resolveLogoutJwtRevocationClaims(
  token: string,
  user: AuthenticatedRequest["user"],
): LogoutJwtRevocationClaims | null {
  const decodedClaims = readLogoutJwtClaimsFromToken(token);
  const jwtId = String(user?.jti || decodedClaims?.jwtId || "").trim();
  if (!jwtId) {
    return null;
  }

  const userExpiresAtMs = typeof user?.exp === "number" ? user.exp * 1000 : 0;
  const expiresAtMs = Number.isFinite(userExpiresAtMs) && userExpiresAtMs > 0
    ? userExpiresAtMs
    : decodedClaims?.expiresAtMs ?? 0;

  return { jwtId, expiresAtMs };
}

export function registerActivityReadRoutes(context: ActivityRouteContext) {
  const {
    app,
    authenticateToken,
    requireRole,
    requireTabAccess,
    activityService,
  } = context;

  app.post(
    "/api/activity/logout",
    authenticateToken,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      if (!req.user) {
        clearAuthSessionCookie(res);
        return res.status(401).json(buildActivityErrorPayload());
      }

      const token = readAuthSessionTokenFromHeaders(req.headers);
      const revocationClaims = token ? resolveLogoutJwtRevocationClaims(token, req.user) : null;
      await activityService.logout(req.user.activityId, req.user.username);
      if (revocationClaims) {
        try {
          await revokeSessionJwt({
            jwtId: revocationClaims.jwtId,
            expiresAtMs: revocationClaims.expiresAtMs,
          });
        } catch {
          clearAuthSessionCookie(res);
          const message = "Logout is temporarily unavailable while session revocation is degraded.";
          return res.status(503).json(
            buildActivityErrorPayload(message, {
              error: {
                code: "SESSION_REVOCATION_UNAVAILABLE",
                message,
              },
            },
            ),
          );
        }
      }
      clearAuthSessionCookie(res);
      return res.json(buildActivitySuccessPayload());
    }),
  );

  app.get(
    "/api/activity/all",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("activity"),
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      return res.json({ activities: await activityService.getAllActivities(req.user?.activityId) });
    }),
  );

  app.get(
    "/api/activity/filter",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("activity"),
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      return res.json({
        activities: await activityService.getFilteredActivities(
          buildActivityFilters(readQueryObject(req.query)),
          req.user?.activityId,
        ),
      });
    }),
  );

  app.get(
    "/api/users/banned",
    authenticateToken,
    requireRole("admin", "superuser"),
    requireTabAccess("activity"),
    asyncHandler(async (_req, res) => {
      return res.json({
        users: await activityService.getBannedUsers(),
      });
    }),
  );

  app.post(
    "/api/activity/heartbeat",
    authenticateToken,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      if (!req.user) {
        return res.status(401).json({ ok: false, message: "Unauthenticated" });
      }

      return res.json(await activityService.heartbeat(req.user.activityId));
    }),
  );

  app.get(
    "/api/activities",
    authenticateToken,
    requireRole("admin", "superuser"),
    requireTabAccess("activity"),
    asyncHandler(async (_req, res) => {
      return res.json(await activityService.getAllActivities());
    }),
  );

  app.get(
    "/api/activities/active",
    authenticateToken,
    requireRole("admin", "superuser"),
    requireTabAccess("activity"),
    asyncHandler(async (_req, res) => {
      return res.json(await activityService.getActiveActivities());
    }),
  );

  app.post(
    "/api/activities/filter",
    authenticateToken,
    requireRole("admin", "superuser"),
    requireTabAccess("activity"),
    asyncHandler(async (req, res) => {
      const filters = buildActivityFilters(readActivityBodyObject(req.body));
      return res.json(await activityService.getFilteredActivities(filters));
    }),
  );
}

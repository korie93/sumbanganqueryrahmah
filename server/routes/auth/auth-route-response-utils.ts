import type { NextFunction, RequestHandler, Response } from "express";
import type { AuthenticatedRequest } from "../../auth/guards";
import { HttpError } from "../../http/errors";
import { logRouteHandlerError } from "../../http/route-observability";
import {
  type ManagedAccountActivationDelivery,
  type ManagedAccountPasswordResetDelivery,
  AuthAccountError,
} from "../../services/auth-account.service";
import type { PostgresStorage } from "../../storage-postgres";

export type AuthRouteJsonHandler = (
  req: AuthenticatedRequest,
  res: Response,
) => Promise<unknown>;

export function buildManagedUserPayload(
  user: Awaited<ReturnType<PostgresStorage["getManagedUsers"]>>[number],
) {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    passwordResetBySuperuser: user.passwordResetBySuperuser,
    createdBy: user.createdBy,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    activatedAt: user.activatedAt,
    lastLoginAt: user.lastLoginAt,
    passwordChangedAt: user.passwordChangedAt,
    isBanned: user.isBanned,
    failedLoginAttempts: user.failedLoginAttempts,
    lockedAt: user.lockedAt,
    lockedReason: user.lockedReason,
    lockedBySystem: user.lockedBySystem,
  };
}

export function buildUserPayload(user: Awaited<ReturnType<PostgresStorage["getUser"]>>) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    passwordResetBySuperuser: user.passwordResetBySuperuser,
    isBanned: user.isBanned,
    twoFactorEnabled: user.twoFactorEnabled,
    twoFactorPendingSetup: Boolean(user.twoFactorSecretEncrypted) && user.twoFactorEnabled !== true,
    twoFactorConfiguredAt: user.twoFactorConfiguredAt,
    activatedAt: user.activatedAt,
    passwordChangedAt: user.passwordChangedAt,
    lastLoginAt: user.lastLoginAt,
  };
}

export function buildDeliveryPayload(
  activation: ManagedAccountActivationDelivery | ManagedAccountPasswordResetDelivery,
) {
  return {
    deliveryMode: activation.deliveryMode,
    errorCode: activation.errorCode,
    errorMessage: activation.errorMessage,
    expiresAt: activation.expiresAt,
    previewUrl: activation.previewUrl,
    recipientEmail: activation.recipientEmail,
    sent: activation.sent,
  };
}

export function buildOkPayload<T extends Record<string, unknown>>(payload: T): T & { ok: true } {
  return {
    ok: true,
    ...payload,
  };
}

export function buildAuthRouteErrorPayload(error: {
  message: string;
  code?: string | undefined;
  details?: unknown;
  extra?: Record<string, unknown> | undefined;
}) {
  return {
    ok: false,
    message: error.message,
    ...((error.code || error.details)
      ? {
          error: {
            ...(error.code ? { code: error.code } : {}),
            message: error.message,
            ...(error.details !== undefined ? { details: error.details } : {}),
          },
        }
      : {}),
    ...(error.extra || {}),
  };
}

export function sendAuthRouteError(res: Response, error: unknown) {
  if (error instanceof AuthAccountError) {
    res.status(error.statusCode).json(buildAuthRouteErrorPayload({
      code: error.code,
      ...(error.extra ? { extra: error.extra } : {}),
      message: error.message,
    }));
    return true;
  }

  if (error instanceof HttpError) {
    res.status(error.statusCode).json(buildAuthRouteErrorPayload({
      code: error.code,
      details: error.details,
      message: error.message,
    }));
    return true;
  }

  return false;
}

export function createAuthJsonRoute(handler: AuthRouteJsonHandler): RequestHandler {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    void Promise.resolve()
      .then(() => handler(req, res))
      .then((payload) => {
        if (!res.headersSent && payload !== undefined) {
          res.json(payload);
        }
      })
      .catch((error) => {
        if (sendAuthRouteError(res, error)) {
          return;
        }
        logRouteHandlerError(error, req, { message: "Unhandled auth route error" });
        next(error);
      });
  };
}

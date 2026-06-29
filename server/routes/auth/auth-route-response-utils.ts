import type { RequestHandler, Response } from "express";
import type { AuthenticatedRequest } from "../../auth/guards";
import { sanitizeHttpErrorDetails } from "../../http/error-details";
import { HttpError } from "../../http/errors";
import { logRouteHandlerError } from "../../http/route-observability";
import {
  type ManagedAccountActivationDelivery,
  type ManagedAccountPasswordResetDelivery,
  AuthAccountError,
} from "../../services/auth-account.service";
import type { PostgresStorage } from "../../storage-postgres";

const UTC_NAIVE_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?$/;

export type AuthRouteJsonHandler = (
  req: AuthenticatedRequest,
  res: Response,
) => Promise<unknown>;

type AuthRouteTimestampInput = Date | string | null | undefined;

function normalizeTimestampInput(value: AuthRouteTimestampInput): Date | null {
  if (value == null) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const timestamp = UTC_NAIVE_TIMESTAMP_PATTERN.test(trimmed)
    ? trimmed.replace(" ", "T").replace(/$/, "Z")
    : trimmed;
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function buildRequiredIsoTimestamp(
  value: AuthRouteTimestampInput,
  fieldName: string,
): string {
  const parsed = normalizeTimestampInput(value);
  if (!parsed) {
    throw new Error(`Invalid auth response timestamp: ${fieldName}`);
  }
  return parsed.toISOString();
}

export function buildNullableIsoTimestamp(value: AuthRouteTimestampInput): string | null {
  return normalizeTimestampInput(value)?.toISOString() ?? null;
}

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
    createdAt: buildRequiredIsoTimestamp(user.createdAt, "createdAt"),
    updatedAt: buildRequiredIsoTimestamp(user.updatedAt, "updatedAt"),
    activatedAt: buildNullableIsoTimestamp(user.activatedAt),
    lastLoginAt: buildNullableIsoTimestamp(user.lastLoginAt),
    passwordChangedAt: buildNullableIsoTimestamp(user.passwordChangedAt),
    isBanned: user.isBanned,
    failedLoginAttempts: user.failedLoginAttempts,
    lockedAt: buildNullableIsoTimestamp(user.lockedAt),
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
    twoFactorConfiguredAt: buildNullableIsoTimestamp(user.twoFactorConfiguredAt),
    activatedAt: buildNullableIsoTimestamp(user.activatedAt),
    passwordChangedAt: buildNullableIsoTimestamp(user.passwordChangedAt),
    lastLoginAt: buildNullableIsoTimestamp(user.lastLoginAt),
  };
}

export function buildPendingPasswordResetRequestPayload(
  request: Awaited<ReturnType<PostgresStorage["listPendingPasswordResetRequests"]>>[number],
) {
  return {
    id: request.id,
    userId: request.userId,
    username: request.username,
    fullName: request.fullName,
    email: request.email,
    role: request.role,
    status: request.status,
    isBanned: request.isBanned,
    requestedByUser: request.requestedByUser,
    approvedBy: request.approvedBy,
    resetType: request.resetType,
    createdAt: buildRequiredIsoTimestamp(request.createdAt, "createdAt"),
    expiresAt: buildNullableIsoTimestamp(request.expiresAt),
    usedAt: buildNullableIsoTimestamp(request.usedAt),
  };
}

export function buildDeliveryPayload(
  activation: ManagedAccountActivationDelivery | ManagedAccountPasswordResetDelivery,
) {
  return {
    deliveryMode: activation.deliveryMode,
    errorCode: activation.errorCode,
    errorMessage: activation.errorMessage,
    expiresAt: buildRequiredIsoTimestamp(activation.expiresAt, "expiresAt"),
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
  const sanitizedDetails = error.details !== undefined
    ? sanitizeHttpErrorDetails(error.details)
    : undefined;

  return {
    ok: false,
    message: error.message,
    ...((error.code || sanitizedDetails !== undefined)
      ? {
          error: {
            ...(error.code ? { code: error.code } : {}),
            message: error.message,
            ...(sanitizedDetails !== undefined ? { details: sanitizedDetails } : {}),
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
  return async (req: AuthenticatedRequest, res, next) => {
    try {
      const payload = await handler(req, res);
      if (!res.headersSent && payload !== undefined) {
        res.json(payload);
      }
    } catch (error) {
      if (sendAuthRouteError(res, error)) {
        return;
      }
      logRouteHandlerError(error, req, { message: "Unhandled auth route error" });
      next(error);
    }
  };
}

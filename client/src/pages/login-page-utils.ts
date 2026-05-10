import type { User } from "@/app/types";
import type { LoginSuccessResponse } from "@/lib/api/auth";
import { normalizeAuthIdentifier, normalizeTwoFactorCode } from "@/pages/auth-field-utils";

export type LoginFieldErrors = {
  username?: string | undefined;
  password?: string | undefined;
  twoFactorCode?: string | undefined;
};

export function buildAuthenticatedUser(response: LoginSuccessResponse): User {
  const { username, role } = response;

  if (!username || !role) {
    throw new Error("Maklumat log masuk daripada server tidak lengkap.");
  }

  return {
    id: response.user?.id,
    username: normalizeAuthIdentifier(response.user?.username || username),
    fullName: response.user?.fullName ?? null,
    email: response.user?.email ?? null,
    role: String(response.user?.role || role),
    status: String(response.user?.status || response.status || "active"),
    mustChangePassword: Boolean(response.user?.mustChangePassword ?? response.mustChangePassword ?? false),
    passwordResetBySuperuser: Boolean(response.user?.passwordResetBySuperuser ?? false),
    isBanned: response.user?.isBanned ?? null,
    twoFactorEnabled: Boolean(response.user?.twoFactorEnabled ?? false),
    twoFactorPendingSetup: Boolean(response.user?.twoFactorPendingSetup ?? false),
    twoFactorConfiguredAt: response.user?.twoFactorConfiguredAt ?? null,
    sessionExpiresAt: response.sessionExpiresAt,
  };
}

export function resolveAuthenticatedDefaultTab(
  user: Pick<User, "mustChangePassword" | "role">,
): string {
  if (user.mustChangePassword) {
    return "change-password";
  }

  return user.role === "admin" || user.role === "superuser"
    ? "home"
    : "general-search";
}

export function normalizeLoginErrorMessage(message: string): string {
  if (message.includes("Account is banned") || message.includes('"banned":true')) {
    return "Your account has been banned. Please contact administrator.";
  }

  return message;
}

export function isAbortRequestError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function isLockedAccountError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const errorRecord = error as { code?: unknown; locked?: unknown };
  return errorRecord.code === "ACCOUNT_LOCKED" || errorRecord.locked === true;
}

function parseStructuredErrorMessage(message: string): Record<string, unknown> | null {
  const match = message.match(/^\d+:\s*(\{.*\})$/s);
  if (!match) {
    return null;
  }

  try {
    const parsed = JSON.parse(match[1]) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function readRetryAfterMs(error: unknown): number | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const errorRecord = error as { message?: unknown; retryAfterMs?: unknown; status?: unknown };
  const directRetryAfterMs = Number(errorRecord.retryAfterMs);
  if (Number.isFinite(directRetryAfterMs) && directRetryAfterMs >= 0) {
    return directRetryAfterMs;
  }

  if (typeof errorRecord.message !== "string") {
    return null;
  }

  const parsed = parseStructuredErrorMessage(errorRecord.message);
  const parsedRetryAfterMs = Number(parsed?.retryAfterMs);
  if (Number.isFinite(parsedRetryAfterMs) && parsedRetryAfterMs >= 0) {
    return parsedRetryAfterMs;
  }

  return null;
}

function readErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const directStatus = Number((error as { status?: unknown }).status);
  if (Number.isFinite(directStatus)) {
    return directStatus;
  }

  const message = (error as { message?: unknown }).message;
  if (typeof message !== "string") {
    return null;
  }

  const match = message.match(/^(\d+):\s*/);
  return match ? Number(match[1]) : null;
}

function formatRetryAfterMessage(retryAfterMs: number): string {
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return `Terlalu banyak percubaan. Sila cuba semula dalam ${seconds} saat.`;
}

export function readErrorMessage(error: unknown, fallback: string): string {
  const retryAfterMs = readRetryAfterMs(error);
  if (retryAfterMs !== null && readErrorStatus(error) === 429) {
    return formatRetryAfterMessage(retryAfterMs);
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return fallback;
}

export function validatePasswordLoginFields(
  username: string,
  password: string,
): LoginFieldErrors {
  const normalizedUsername = normalizeAuthIdentifier(username);

  return {
    ...(!normalizedUsername ? { username: "Sila masukkan username." } : {}),
    ...(!password ? { password: "Sila masukkan password." } : {}),
  };
}

export function validateTwoFactorCodeField(code: string): LoginFieldErrors {
  const normalizedCode = normalizeTwoFactorCode(code);
  return normalizedCode.length === 6
    ? {}
    : { twoFactorCode: "Sila masukkan kod pengesah 6 digit." };
}

export function hasLoginFieldErrors(errors: LoginFieldErrors): boolean {
  return Boolean(errors.username || errors.password || errors.twoFactorCode);
}

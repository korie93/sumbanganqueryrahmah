import type { User } from "@/app/types";
import type { LoginSuccessResponse } from "@/lib/api/auth";

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
    username: String(response.user?.username || username).toLowerCase(),
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

export function readErrorMessage(error: unknown, fallback: string): string {
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
  const normalizedUsername = username.trim();

  return {
    ...(!normalizedUsername ? { username: "Sila masukkan username." } : {}),
    ...(!password ? { password: "Sila masukkan password." } : {}),
  };
}

export function validateTwoFactorCodeField(code: string): LoginFieldErrors {
  const normalizedCode = code.replace(/\D/g, "").slice(0, 6);
  return normalizedCode.length === 6
    ? {}
    : { twoFactorCode: "Sila masukkan kod pengesah 6 digit." };
}

export function hasLoginFieldErrors(errors: LoginFieldErrors): boolean {
  return Boolean(errors.username || errors.password || errors.twoFactorCode);
}

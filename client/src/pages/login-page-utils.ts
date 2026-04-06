import type { User } from "@/app/types";
import type { LoginSuccessResponse } from "@/lib/api/auth";

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

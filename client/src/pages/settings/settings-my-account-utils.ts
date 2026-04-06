import { broadcastForcedLogout, persistAuthenticatedUser } from "@/lib/auth-session";
import type { CurrentUser } from "@/pages/settings/types";

export function buildNextCurrentUser(
  currentUser: CurrentUser,
  normalizedUsername: string,
  response: {
    user: CurrentUser | null;
  },
): CurrentUser {
  return {
    id: String(response?.user?.id || currentUser.id),
    username: String(response?.user?.username || normalizedUsername),
    fullName: response?.user?.fullName ?? currentUser.fullName ?? null,
    email: response?.user?.email ?? currentUser.email ?? null,
    role: String(response?.user?.role || currentUser.role),
    status: String(response?.user?.status || currentUser.status || "active"),
    mustChangePassword: Boolean(
      response?.user?.mustChangePassword ?? currentUser.mustChangePassword,
    ),
    passwordResetBySuperuser: Boolean(
      response?.user?.passwordResetBySuperuser ?? currentUser.passwordResetBySuperuser,
    ),
    isBanned: response?.user?.isBanned ?? currentUser.isBanned ?? null,
    twoFactorEnabled: Boolean(
      response?.user?.twoFactorEnabled ?? currentUser.twoFactorEnabled ?? false,
    ),
    twoFactorPendingSetup: Boolean(
      response?.user?.twoFactorPendingSetup ?? currentUser.twoFactorPendingSetup ?? false,
    ),
    twoFactorConfiguredAt:
      response?.user?.twoFactorConfiguredAt ?? currentUser.twoFactorConfiguredAt ?? null,
  };
}

export function syncSettingsCurrentUser(nextUser: CurrentUser) {
  persistAuthenticatedUser(nextUser);
  window.dispatchEvent(new CustomEvent("profile-updated", { detail: nextUser }));
}

export function forceLogoutAfterPasswordChange() {
  broadcastForcedLogout("Password changed. Please login again.");
}

export function normalizeAuthenticatorCode(value: string) {
  return value.replace(/\D/g, "").slice(0, 6);
}

export function canConfigureTwoFactor(role: string | undefined) {
  return role === "admin" || role === "superuser";
}

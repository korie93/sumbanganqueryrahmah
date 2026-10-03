import type { User } from "@/app/types";
import { getStoredAuthenticatedUser, persistAuthenticatedUser } from "@/lib/auth-session";

export function safeAccountAvatarUrl(value: string | null | undefined): string | undefined {
  return value && /^\/api\/me\/avatar\?v=[a-f0-9]{24,64}$/.test(value) ? value : undefined;
}

type ProfileMutationScope = "avatar" | "two-factor";

/** Only publish fields owned by a mutation, never its captured account snapshot. */
export function createAccountProfilePatch(user: User, scope: ProfileMutationScope | "all"): User {
  return {
    id: user.id, username: user.username, role: user.role, sessionExpiresAt: user.sessionExpiresAt,
    ...(scope !== "two-factor" && user.avatarUrl !== undefined ? { avatarUrl: safeAccountAvatarUrl(user.avatarUrl) ?? null } : {}),
    ...(scope !== "two-factor" && user.createdAt !== undefined ? { createdAt: user.createdAt } : {}),
    ...(scope !== "avatar" && user.twoFactorEnabled !== undefined ? { twoFactorEnabled: user.twoFactorEnabled } : {}),
    ...(scope !== "avatar" && user.twoFactorPendingSetup !== undefined ? { twoFactorPendingSetup: user.twoFactorPendingSetup } : {}),
    ...(scope !== "avatar" && user.twoFactorConfiguredAt !== undefined ? { twoFactorConfiguredAt: user.twoFactorConfiguredAt } : {}),
  };
}

export function mergeAccountProfile(previous: User | null, update: User): User | null {
  if (!previous || !previous.id || update.id !== previous.id || update.username !== previous.username
    || (update.sessionExpiresAt && previous.sessionExpiresAt && update.sessionExpiresAt !== previous.sessionExpiresAt)) return previous;
  return { ...previous,
    avatarUrl: update.avatarUrl !== undefined ? (safeAccountAvatarUrl(update.avatarUrl) ?? null) : previous.avatarUrl,
    createdAt: update.createdAt !== undefined ? update.createdAt : previous.createdAt,
    twoFactorEnabled: update.twoFactorEnabled ?? previous.twoFactorEnabled,
    twoFactorPendingSetup: update.twoFactorPendingSetup ?? previous.twoFactorPendingSetup,
    twoFactorConfiguredAt: update.twoFactorConfiguredAt !== undefined ? update.twoFactorConfiguredAt : previous.twoFactorConfiguredAt,
  };
}

export function syncAccountProfile(user: User, scope: ProfileMutationScope) {
  const previous = getStoredAuthenticatedUser();
  const patch = createAccountProfilePatch(user, scope);
  const next = mergeAccountProfile(previous, patch);
  if (!next || next === previous) return;
  persistAuthenticatedUser(next);
  window.dispatchEvent(new CustomEvent("profile-updated", { detail: patch }));
}

export function formatAccountCreatedAt(value: string | null | undefined) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-MY", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kuala_Lumpur" }).format(date);
}

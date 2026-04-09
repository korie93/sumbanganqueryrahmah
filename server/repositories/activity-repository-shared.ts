import type { User, UserActivity } from "../../shared/schema-postgres";

export const ACTIVITY_QUERY_PAGE_LIMIT = 1000;

export type ActivityRepositoryOptions = {
  ensureBannedSessionsTable: () => Promise<void>;
};

export type ActivityWithStatus = UserActivity & { status: string };

export type BannedUserWithInfo = User & {
  banInfo?: { ipAddress: string | null; browser: string | null; bannedAt: Date | null } | undefined;
};

type BannedUserRow = {
  id?: unknown;
  username?: unknown;
  password_hash?: unknown;
  full_name?: unknown;
  email?: unknown;
  role?: unknown;
  status?: unknown;
  must_change_password?: unknown;
  password_reset_by_superuser?: unknown;
  created_by?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  password_changed_at?: unknown;
  activated_at?: unknown;
  last_login_at?: unknown;
  is_banned?: unknown;
  two_factor_enabled?: unknown;
  two_factor_secret_encrypted?: unknown;
  two_factor_configured_at?: unknown;
  failed_login_attempts?: unknown;
  locked_at?: unknown;
  locked_reason?: unknown;
  locked_by_system?: unknown;
  banLogoutTime?: unknown;
  banIpAddress?: unknown;
  banBrowser?: unknown;
};

function normalizeActivityRow<T extends Record<string, unknown>>(row: unknown): T {
  return (typeof row === "object" && row !== null ? row : {}) as T;
}

export function computeActivityStatus(activity: UserActivity): string {
  if (!activity.isActive) {
    if (activity.logoutReason === "KICKED") return "KICKED";
    if (activity.logoutReason === "BANNED") return "BANNED";
    return "LOGOUT";
  }

  if (activity.lastActivityTime) {
    const lastActive = new Date(activity.lastActivityTime).getTime();
    const diffMinutes = Math.floor((Date.now() - lastActive) / 60_000);
    if (diffMinutes >= 5) return "IDLE";
  }

  return "ONLINE";
}

export function mapBannedUserRow(row: unknown): BannedUserWithInfo {
  const normalizedRow = normalizeActivityRow<BannedUserRow>(row);
  return {
    id: String(normalizedRow.id ?? ""),
    username: String(normalizedRow.username ?? ""),
    passwordHash: String(normalizedRow.password_hash ?? ""),
    fullName: (normalizedRow.full_name ?? null) as string | null,
    email: (normalizedRow.email ?? null) as string | null,
    role: String(normalizedRow.role ?? "user") as User["role"],
    status: String(normalizedRow.status ?? "active") as User["status"],
    mustChangePassword: Boolean(normalizedRow.must_change_password ?? false),
    passwordResetBySuperuser: Boolean(normalizedRow.password_reset_by_superuser ?? false),
    createdBy: (normalizedRow.created_by ?? null) as string | null,
    createdAt: normalizedRow.created_at as User["createdAt"],
    updatedAt: normalizedRow.updated_at as User["updatedAt"],
    passwordChangedAt: (normalizedRow.password_changed_at ?? null) as User["passwordChangedAt"],
    activatedAt: (normalizedRow.activated_at ?? null) as User["activatedAt"],
    lastLoginAt: (normalizedRow.last_login_at ?? null) as User["lastLoginAt"],
    isBanned: (normalizedRow.is_banned ?? null) as User["isBanned"],
    twoFactorEnabled: Boolean(normalizedRow.two_factor_enabled ?? false),
    twoFactorSecretEncrypted: (normalizedRow.two_factor_secret_encrypted ?? null) as User["twoFactorSecretEncrypted"],
    twoFactorConfiguredAt: (normalizedRow.two_factor_configured_at ?? null) as User["twoFactorConfiguredAt"],
    failedLoginAttempts: Number(normalizedRow.failed_login_attempts ?? 0),
    lockedAt: (normalizedRow.locked_at ?? null) as User["lockedAt"],
    lockedReason: (normalizedRow.locked_reason ?? null) as User["lockedReason"],
    lockedBySystem: Boolean(normalizedRow.locked_by_system ?? false),
    banInfo: normalizedRow.banLogoutTime
      ? {
        ipAddress: (normalizedRow.banIpAddress ?? null) as string | null,
        browser: (normalizedRow.banBrowser ?? null) as string | null,
        bannedAt: normalizedRow.banLogoutTime ? new Date(normalizedRow.banLogoutTime as string | number | Date) : null,
      }
      : undefined,
  };
}

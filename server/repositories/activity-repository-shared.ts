import type { User, UserActivity } from "../../shared/schema-postgres";

export const ACTIVITY_QUERY_PAGE_LIMIT = 1000;

export type ActivityRepositoryOptions = {
  ensureBannedSessionsTable: () => Promise<void>;
};

export type ActivityWithStatus = UserActivity & { status: string };

export type BannedUserWithInfo = User & {
  banInfo?: { ipAddress: string | null; browser: string | null; bannedAt: Date | null };
};

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

export function mapBannedUserRow(row: any): BannedUserWithInfo {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    fullName: row.full_name ?? null,
    email: row.email ?? null,
    role: row.role,
    status: row.status ?? "active",
    mustChangePassword: Boolean(row.must_change_password ?? false),
    passwordResetBySuperuser: Boolean(row.password_reset_by_superuser ?? false),
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    passwordChangedAt: row.password_changed_at,
    activatedAt: row.activated_at ?? null,
    lastLoginAt: row.last_login_at ?? null,
    isBanned: row.is_banned,
    twoFactorEnabled: Boolean(row.two_factor_enabled ?? false),
    twoFactorSecretEncrypted: row.two_factor_secret_encrypted ?? null,
    twoFactorConfiguredAt: row.two_factor_configured_at ?? null,
    failedLoginAttempts: Number(row.failed_login_attempts ?? 0),
    lockedAt: row.locked_at ?? null,
    lockedReason: row.locked_reason ?? null,
    lockedBySystem: Boolean(row.locked_by_system ?? false),
    banInfo: row.banLogoutTime
      ? {
        ipAddress: row.banIpAddress ?? null,
        browser: row.banBrowser ?? null,
        bannedAt: row.banLogoutTime ? new Date(row.banLogoutTime) : null,
      }
      : undefined,
  };
}

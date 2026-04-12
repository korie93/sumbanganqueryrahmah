import type { User } from "../../shared/schema-postgres";
import type { BannedUserRow, BannedUserWithInfo } from "./activity-repository-types";

function normalizeActivityRow<T extends Record<string, unknown>>(row: unknown): T {
  return (typeof row === "object" && row !== null ? row : {}) as T;
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
          bannedAt: normalizedRow.banLogoutTime
            ? new Date(normalizedRow.banLogoutTime as string | number | Date)
            : null,
        }
      : undefined,
  };
}

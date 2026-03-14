export const USER_ROLES = ["user", "admin", "superuser"] as const;
export const MANAGEABLE_USER_ROLES = ["user", "admin"] as const;
export const ACCOUNT_STATUSES = [
  "pending_activation",
  "active",
  "suspended",
  "disabled",
] as const;

export type UserRole = (typeof USER_ROLES)[number];
export type ManageableUserRole = (typeof MANAGEABLE_USER_ROLES)[number];
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export type AccountLifecycleState = {
  role: string | null | undefined;
  status: string | null | undefined;
  isBanned: boolean | null | undefined;
  mustChangePassword?: boolean | null | undefined;
};

export function normalizeUserRole(value: unknown, fallback: UserRole = "user"): UserRole {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "superuser") return "superuser";
  if (normalized === "admin") return "admin";
  if (normalized === "user") return "user";
  return fallback;
}

export function normalizeManageableUserRole(
  value: unknown,
  fallback: ManageableUserRole = "user",
): ManageableUserRole {
  const normalized = normalizeUserRole(value, fallback);
  return normalized === "admin" ? "admin" : "user";
}

export function normalizeAccountStatus(
  value: unknown,
  fallback: AccountStatus = "pending_activation",
): AccountStatus {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "active") return "active";
  if (normalized === "suspended") return "suspended";
  if (normalized === "disabled") return "disabled";
  if (normalized === "pending_activation") return "pending_activation";
  return fallback;
}

export function isManageableUserRole(value: unknown): value is ManageableUserRole {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "user" || normalized === "admin";
}

export function isValidUserRole(value: unknown): value is UserRole {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "user" || normalized === "admin" || normalized === "superuser";
}

export function isValidAccountStatus(value: unknown): value is AccountStatus {
  const normalized = String(value || "").trim().toLowerCase();
  return ACCOUNT_STATUSES.includes(normalized as AccountStatus);
}

export function isBcryptHash(value: unknown): boolean {
  const normalized = String(value || "").trim();
  return /^\$2[aby]\$\d{2}\$/.test(normalized);
}

export function getAccountAccessBlockReason(state: AccountLifecycleState):
  | "invalid_role"
  | "banned"
  | "pending_activation"
  | "suspended"
  | "disabled"
  | null {
  if (!isValidUserRole(state.role)) return "invalid_role";
  if (state.isBanned === true) return "banned";

  const status = normalizeAccountStatus(
    state.status,
    isBcryptHash((state as { passwordHash?: unknown }).passwordHash) ? "active" : "pending_activation",
  );
  if (status === "active") return null;
  return status;
}

export function canUserBypassForcedPasswordChange(role: string | null | undefined): boolean {
  void role;
  return false;
}

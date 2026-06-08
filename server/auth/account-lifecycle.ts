import {
  USER_ROLES,
  type ManageableUserRole,
  type UserRole,
} from "../../shared/user-roles";

export {
  MANAGEABLE_USER_ROLES,
  USER_ROLES,
  type ManageableUserRole,
  type UserRole,
} from "../../shared/user-roles";
export const ACCOUNT_STATUSES = [
  "pending_activation",
  "active",
  "suspended",
  "disabled",
] as const;

export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export type AccountLifecycleState = {
  role: string | null | undefined;
  status: string | null | undefined;
  isBanned: boolean | null | undefined;
  lockedAt?: Date | string | null | undefined;
  mustChangePassword?: boolean | null | undefined;
};

export function normalizeUserRole(value: unknown, fallback: UserRole = "user"): UserRole {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "superuser") return "superuser";
  if (normalized === "manager") return "manager";
  if (normalized === "admin") return "admin";
  if (normalized === "user") return "user";
  return fallback;
}

export function normalizeManageableUserRole(
  value: unknown,
  fallback: ManageableUserRole = "user",
): ManageableUserRole {
  const normalized = normalizeUserRole(value, fallback);
  if (normalized === "manager") return "manager";
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
  return normalized === "user" || normalized === "admin" || normalized === "manager";
}

export function isValidUserRole(value: unknown): value is UserRole {
  const normalized = String(value || "").trim().toLowerCase();
  return USER_ROLES.includes(normalized as UserRole);
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
  | "locked"
  | "pending_activation"
  | "suspended"
  | "disabled"
  | null {
  if (!isValidUserRole(state.role)) return "invalid_role";
  if (state.isBanned === true) return "banned";
  if (state.lockedAt) return "locked";

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

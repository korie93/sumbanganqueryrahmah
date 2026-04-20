export const INTERNAL_SYSTEM_ACCOUNT_USERNAME = "system";
export const MANAGED_ACCOUNT_DELETED_LOCK_REASON = "account_deleted";

export function isHiddenManagedAccountRecord(params: {
  lockedReason?: string | null | undefined;
  username?: string | null | undefined;
}) {
  const normalizedUsername = String(params.username || "").trim().toLowerCase();
  if (normalizedUsername === INTERNAL_SYSTEM_ACCOUNT_USERNAME) {
    return true;
  }

  const normalizedLockedReason = String(params.lockedReason || "").trim().toLowerCase();
  return normalizedLockedReason === MANAGED_ACCOUNT_DELETED_LOCK_REASON;
}

export function getInvalidatedSessionMessage(logoutReason?: string | null): string {
  const normalized = String(logoutReason || "").trim().toUpperCase();

  if (normalized === "NEW_SESSION") {
    return "Your account was opened in another browser or device. Please login again.";
  }

  if (normalized === "PASSWORD_RESET_BY_SUPERUSER" || normalized === "PASSWORD_RESET_COMPLETED") {
    return "Password was reset. Please login again.";
  }

  if (normalized === "PASSWORD_CHANGED") {
    return "Password changed. Please login again.";
  }

  return "Session expired. Please login again.";
}

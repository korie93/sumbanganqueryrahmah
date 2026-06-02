import { t } from "../i18n/server";

export function getInvalidatedSessionMessage(logoutReason?: string | null): string {
  const normalized = String(logoutReason || "").trim().toUpperCase();

  if (normalized === "NEW_SESSION") {
    return t("auth.sessionReplaced");
  }

  if (normalized === "PASSWORD_RESET_BY_SUPERUSER" || normalized === "PASSWORD_RESET_COMPLETED") {
    return t("auth.passwordReset");
  }

  if (normalized === "PASSWORD_CHANGED") {
    return t("auth.passwordChanged");
  }

  return t("auth.sessionExpired");
}

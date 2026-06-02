// AUDIT2-FIX [L4]: Centralized user-facing server messages.
export const enServerMessages = {
  "auth.accountBanned": "Account is banned",
  "auth.accountLocked":
    "Your account has been locked due to too many incorrect login attempts. Please contact the system administrator.",
  "auth.invalidCredentials": "Invalid credentials",
  "auth.invalidToken": "Invalid token",
  "auth.passwordChangeRequired": "Password change required before accessing the application.",
  "auth.passwordChanged": "Password changed. Please login again.",
  "auth.passwordReset": "Password was reset. Please login again.",
  "auth.sessionBanned": "Session banned. Please login again.",
  "auth.sessionExpired": "Session expired. Please login again.",
  "auth.sessionRefreshUnavailable": "Session refresh is temporarily unavailable. Please try again.",
  "auth.sessionReplaced": "Your account was opened in another browser or device. Please login again.",
  "auth.tokenRequired": "Token required",
  "auth.twoFactorInvalidCode": "Authenticator code is invalid.",
  "auth.twoFactorNotEnabled": "Two-factor authentication is not enabled.",
  "auth.twoFactorUnavailable": "Two-factor authentication is unavailable.",
} as const;

export type EnServerMessageKey = keyof typeof enServerMessages;

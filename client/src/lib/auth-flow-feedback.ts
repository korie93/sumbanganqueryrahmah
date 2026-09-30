import { getApiErrorMessage } from "@/lib/api-errors";
import { safeJsonParseResult } from "@/lib/utils/safe-json";
import { translate } from "@/lib/i18n";

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  PASSWORD_CONFIRMATION_MISMATCH: "Pengesahan kata laluan tidak sepadan.",
  RESET_TOKEN_INVALID: "Pautan tetapan semula tidak sah atau telah digunakan. Minta pautan baharu.",
  RESET_TOKEN_EXPIRED: "Pautan tetapan semula telah tamat tempoh. Minta pautan baharu.",
  RESET_TOKEN_USED: "Pautan tetapan semula telah digunakan. Log masuk atau minta pautan baharu.",
  RESET_TOKEN_SUPERSEDED: "Pautan tetapan semula ini telah diganti. Gunakan pautan dalam emel terkini.",
  ACTIVATION_TOKEN_INVALID: "Pautan aktivasi tidak sah. Minta superuser menghantar pautan baharu.",
  ACTIVATION_TOKEN_EXPIRED: "Pautan aktivasi telah tamat tempoh. Minta superuser menghantar pautan baharu.",
  ACTIVATION_TOKEN_SUPERSEDED: "Pautan aktivasi ini telah diganti. Gunakan pautan dalam emel terkini.",
  ACCOUNT_ALREADY_ACTIVATED: "Akaun ini sudah diaktifkan. Sila log masuk atau tetapkan semula kata laluan.",
  TWO_FACTOR_CODE_INVALID: "Kod pengesah tidak betul. Semak tetapan aplikasi pengesah dan cuba kod terkini.",
  TWO_FACTOR_INVALID_CODE: "Kod pengesah tidak betul. Gunakan kod terkini, semak tetapan aplikasi dan pastikan masa telefon ditetapkan secara automatik.",
  TWO_FACTOR_CODE_EXPIRED: "Kod pengesah telah tamat tempoh. Gunakan kod terkini daripada aplikasi pengesah.",
  TWO_FACTOR_CODE_REPLAYED: "Kod pengesah ini telah digunakan. Tunggu kod baharu dalam aplikasi pengesah.",
  TWO_FACTOR_CHALLENGE_EXPIRED: "Sesi pengesahan dua faktor telah tamat tempoh. Sila log masuk semula.",
  TWO_FACTOR_CHALLENGE_INVALID: "Sesi pengesahan dua faktor tidak lagi sah. Sila log masuk semula.",
  TWO_FACTOR_SETUP_MISSING: "Persediaan pengesah tiada. Mulakan persediaan 2FA semula.",
  TWO_FACTOR_SECRET_INVALID: "Tetapan pengesah tidak dapat dibaca dengan selamat. Hubungi pentadbir; jangan padam akaun pengesah anda dahulu.",
  TWO_FACTOR_NOT_ENABLED: "2FA belum diaktifkan untuk akaun ini. Muat semula status akaun sebelum mencuba lagi.",
  TWO_FACTOR_NOT_ALLOWED: "Tetapan 2FA tidak tersedia untuk peranan akaun ini.",
  INVALID_CURRENT_PASSWORD: "Kata laluan semasa tidak betul. Sila semak dan cuba semula.",
  TWO_FACTOR_SETUP_EXPIRED: "Persediaan pengesah telah tamat tempoh. Mulakan persediaan 2FA semula dan gunakan rahsia baharu.",
  TWO_FACTOR_ALREADY_ENABLED: "2FA sudah diaktifkan. Nyahaktifkan dengan kata laluan dan kod pengesah sebelum menyediakan semula.",
  TWO_FACTOR_RATE_LIMITED: "Terlalu banyak percubaan pengesahan. Tunggu sebentar sebelum mencuba lagi.",
  AUTH_RATE_LIMITED: "Terlalu banyak percubaan log masuk atau kod pengesah. Tunggu sehingga had percubaan ditetapkan semula sebelum mencuba lagi.",
  AUTH_MUTATION_RATE_LIMITED: "Terlalu banyak percubaan mengemas kini keselamatan akaun. Tunggu sehingga had percubaan ditetapkan semula sebelum mencuba lagi.",
};

const AUTH_ERROR_MESSAGES_EN: Record<string, string> = {
  PASSWORD_CONFIRMATION_MISMATCH: "Password confirmation does not match.",
  RESET_TOKEN_INVALID: "This reset link is invalid or has already been used. Request a new link.",
  RESET_TOKEN_EXPIRED: "This reset link has expired. Request a new link.",
  RESET_TOKEN_USED: "This reset link has already been used. Sign in or request a new link.",
  RESET_TOKEN_SUPERSEDED: "This reset link has been replaced. Use the link in the latest email.",
  ACTIVATION_TOKEN_INVALID: "This activation link is invalid. Ask a superuser to send a new link.",
  ACTIVATION_TOKEN_EXPIRED: "This activation link has expired. Ask a superuser to send a new link.",
  ACTIVATION_TOKEN_SUPERSEDED: "This activation link has been replaced. Use the link in the latest email.",
  ACCOUNT_ALREADY_ACTIVATED: "This account is already activated. Sign in or reset your password.",
  TWO_FACTOR_CODE_INVALID: "The authenticator code is incorrect. Check your authenticator settings and try the latest code.",
  TWO_FACTOR_INVALID_CODE: "The authenticator code is incorrect. Use the latest code and check that your phone's time is set automatically.",
  TWO_FACTOR_CODE_EXPIRED: "This code has expired. Use the latest code from your authenticator app.",
  TWO_FACTOR_CODE_REPLAYED: "This code has already been used. Wait for a new code in your authenticator app.",
  TWO_FACTOR_CHALLENGE_EXPIRED: "Your two-factor verification session has expired. Sign in again.",
  TWO_FACTOR_CHALLENGE_INVALID: "Your two-factor verification session is no longer valid. Sign in again.",
  TWO_FACTOR_SETUP_MISSING: "Authenticator setup is missing. Start two-factor setup again.",
  TWO_FACTOR_SECRET_INVALID: "Your authenticator settings cannot be read safely. Contact an administrator; do not delete your authenticator account yet.",
  TWO_FACTOR_NOT_ENABLED: "Two-factor authentication is not enabled for this account. Refresh account status before trying again.",
  TWO_FACTOR_NOT_ALLOWED: "Two-factor settings are not available for this account role.",
  INVALID_CURRENT_PASSWORD: "Your current password is incorrect. Check it and try again.",
  TWO_FACTOR_SETUP_EXPIRED: "Authenticator setup has expired. Start setup again and use the new secret.",
  TWO_FACTOR_ALREADY_ENABLED: "Two-factor authentication is already enabled. Disable it with your password and authenticator code before setting it up again.",
  TWO_FACTOR_RATE_LIMITED: "Too many verification attempts. Wait before trying again.",
  AUTH_RATE_LIMITED: "Too many sign-in or verification attempts. Wait for the attempt limit to reset before trying again.",
  AUTH_MUTATION_RATE_LIMITED: "Too many account security update attempts. Wait for the attempt limit to reset before trying again.",
};

const PUBLIC_AUTH_MESSAGES_EN: Record<string, string> = {
  "Maklumat log masuk tidak sah.": "Invalid credentials",
  "Username atau kata laluan tidak sah.": "Invalid username or password.",
  "Log masuk gagal. Sila cuba lagi.": "Login failed. Please try again.",
  "Log masuk gagal": "Login failed",
  "Akaun anda telah dikunci kerana terlalu banyak percubaan log masuk yang tidak sah.": "Your account is locked after too many incorrect sign-in attempts.",
  "Akaun anda telah dikunci kerana terlalu banyak percubaan log masuk yang salah. Sila hubungi pentadbir sistem.": "Your account has been locked due to too many incorrect login attempts. Please contact the system administrator.",
  "Sila lengkapkan pengesahan keselamatan sebelum cuba semula.": "Complete the security verification before trying again.",
  "Sesi pengesahan dua faktor tiada. Sila log masuk semula.": "Your two-factor verification session is missing. Sign in again.",
  "Pengesahan dua faktor gagal. Sila cuba lagi.": "Two-factor verification failed. Try again.",
  "Server sedang tidak tersedia. Sila cuba sebentar lagi.": "The server is unavailable. Try again in a moment.",
  "Sesi anda telah tamat. Sila log masuk semula.": "Session expired. Please login again.",
  "Sesi telah tamat. Sila log masuk semula.": "Session expired. Please sign in again.",
  "Sesi anda telah ditamatkan.": "Your session has ended.",
  "Sesi anda telah tamat kerana tidak aktif.": "Session expired due to inactivity",
  "Kata laluan telah ditukar. Sila log masuk semula.": "Password changed. Please login again.",
  "Kata laluan telah ditetapkan semula. Sila log masuk semula.": "Password was reset. Please login again.",
  "Akaun anda telah dibuka dalam pelayar atau peranti lain. Sila log masuk semula.": "Your account was opened in another browser or device. Please login again.",
  "Sesi lama anda telah tamat kerana kata laluan telah ditetapkan semula. Sila log masuk semula.": "Your previous session ended because your password was reset. Sign in again.",
  "Sila masukkan username atau emel anda.": "Enter your username or email.",
  "Permintaan tetapan semula gagal dihantar.": "Your password reset request could not be submitted.",
  "Pautan tetapan semula kata laluan tidak sah.": "This password reset link is invalid.",
  "Pautan tetapan semula tidak sah atau telah tamat tempoh.": "This reset link is invalid or has expired.",
  "Tetapan semula kata laluan gagal.": "Your password could not be reset.",
  "Pautan aktivasi tidak sah.": "This activation link is invalid.",
  "Pautan aktivasi tidak sah atau telah tamat tempoh.": "This activation link is invalid or has expired.",
  "Aktivasi akaun gagal.": "Your account could not be activated.",
};

/** Translate only known safe feedback, without rerunning or resetting an auth request. */
export function localizeAuthFeedback(message: string, locale: "ms" | "en" = "ms"): string {
  // Translate presentation only: retain the server-derived duration and unknown
  // sanitized messages verbatim, never infer authentication/security outcomes.
  const retry = message.match(/^Terlalu banyak percubaan\. Sila cuba semula dalam (\d+) saat\.$/)
    ?? message.match(/^Too many attempts\. Try again in (\d+) seconds\.$/);
  if (retry) return locale === "en" ? `Too many attempts. Try again in ${retry[1]} seconds.`
    : `Terlalu banyak percubaan. Sila cuba semula dalam ${retry[1]} saat.`;
  const activation = message.match(/^Akaun untuk (.+) telah sedia digunakan\. Sila log masuk menggunakan kata laluan baharu anda\.$/)
    ?? message.match(/^The account for (.+) is ready\. Sign in using your new password\.$/);
  if (activation) return locale === "en" ? `The account for ${activation[1]} is ready. Sign in using your new password.`
    : `Akaun untuk ${activation[1]} telah sedia digunakan. Sila log masuk menggunakan kata laluan baharu anda.`;
  for (const key of ["errors.network", "errors.unknown", "errors.http.401", "errors.http.403", "errors.http.500", "errors.http.502", "errors.http.503", "errors.http.504"] as const) {
    if (message === translate(key, undefined, "ms") || message === translate(key, undefined, "en")) {
      return translate(key, undefined, locale);
    }
  }
  const code = Object.keys(AUTH_ERROR_MESSAGES).find((key) =>
    AUTH_ERROR_MESSAGES[key] === message || AUTH_ERROR_MESSAGES_EN[key] === message);
  if (code) return (locale === "en" ? AUTH_ERROR_MESSAGES_EN[code] : AUTH_ERROR_MESSAGES[code]) || message;
  const source = Object.keys(PUBLIC_AUTH_MESSAGES_EN).find((key) =>
    key === message || PUBLIC_AUTH_MESSAGES_EN[key] === message);
  return source ? locale === "en" ? PUBLIC_AUTH_MESSAGES_EN[source] : source : message;
}

export function shouldRestartTwoFactorLogin(error: unknown): boolean {
  const code = getAuthErrorCode(error);
  return code === "TWO_FACTOR_CHALLENGE_EXPIRED" || code === "TWO_FACTOR_CHALLENGE_INVALID";
}

export function getAuthErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const direct = error as { code?: unknown; message?: unknown; error?: { code?: unknown } };
  const directCode = direct.code ?? direct.error?.code;
  if (typeof directCode === "string") return directCode;
  if (typeof direct.message !== "string") return null;
  const parsed = safeJsonParseResult<unknown>(direct.message.replace(/^\d+:\s*/, ""));
  if (!parsed.ok || !parsed.data || typeof parsed.data !== "object") return null;
  const payload = parsed.data as { code?: unknown; error?: { code?: unknown } };
  const code = payload.code ?? payload.error?.code;
  return typeof code === "string" ? code : null;
}

export function getAuthErrorMessage(error: unknown, fallback: string, flow?: "activation" | "reset", locale: "ms" | "en" = "ms"): string {
  const code = getAuthErrorCode(error);
  if (flow && code && ["INVALID_TOKEN", "TOKEN_EXPIRED", "TOKEN_USED", "TOKEN_SUPERSEDED"].includes(code)) {
    const prefix = flow === "activation" ? "ACTIVATION" : "RESET";
    const suffix = code === "INVALID_TOKEN" ? "INVALID" : code.replace("TOKEN_", "");
    if (flow === "activation" && code === "TOKEN_USED") return localizeAuthFeedback(AUTH_ERROR_MESSAGES.ACCOUNT_ALREADY_ACTIVATED, locale);
    return localizeAuthFeedback(AUTH_ERROR_MESSAGES[`${prefix}_TOKEN_${suffix}`] || fallback, locale);
  }
  return localizeAuthFeedback((code ? AUTH_ERROR_MESSAGES[code] : null) || getApiErrorMessage(error, fallback), locale);
}

/** Read only supported parameters from the server-issued URI; never infer SHA1 defaults. */
export function getAuthenticatorSetupParameters(uri: string) {
  try {
    const parsed = new URL(uri);
    const algorithm = parsed.searchParams.get("algorithm");
    if (parsed.protocol !== "otpauth:" || parsed.hostname !== "totp"
      || (algorithm !== "SHA256" && algorithm !== "SHA1")
      || parsed.searchParams.get("digits") !== "6"
      || parsed.searchParams.get("period") !== "30") return null;
    return { algorithm, digits: 6, period: 30 };
  } catch {
    return null;
  }
}

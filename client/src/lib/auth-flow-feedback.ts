import { getApiErrorMessage } from "@/lib/api-errors";
import { safeJsonParseResult } from "@/lib/utils/safe-json";

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
  TWO_FACTOR_INVALID_CODE: "Kod pengesah tidak betul atau telah digunakan. Semak tetapan aplikasi dan tunggu kod baharu.",
  TWO_FACTOR_CODE_EXPIRED: "Kod pengesah telah tamat tempoh. Gunakan kod terkini daripada aplikasi pengesah.",
  TWO_FACTOR_CODE_REPLAYED: "Kod pengesah ini telah digunakan. Tunggu kod baharu dalam aplikasi pengesah.",
  TWO_FACTOR_CHALLENGE_EXPIRED: "Sesi pengesahan dua faktor telah tamat tempoh. Sila log masuk semula.",
  TWO_FACTOR_SETUP_EXPIRED: "Persediaan pengesah telah tamat tempoh. Mulakan persediaan 2FA semula dan gunakan rahsia baharu.",
  TWO_FACTOR_ALREADY_ENABLED: "2FA sudah diaktifkan. Nyahaktifkan dengan kata laluan dan kod pengesah sebelum menyediakan semula.",
  TWO_FACTOR_RATE_LIMITED: "Terlalu banyak percubaan pengesahan. Tunggu sebentar sebelum mencuba lagi.",
};

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

export function getAuthErrorMessage(error: unknown, fallback: string, flow?: "activation" | "reset"): string {
  const code = getAuthErrorCode(error);
  if (flow && code && ["INVALID_TOKEN", "TOKEN_EXPIRED", "TOKEN_USED", "TOKEN_SUPERSEDED"].includes(code)) {
    const prefix = flow === "activation" ? "ACTIVATION" : "RESET";
    const suffix = code === "INVALID_TOKEN" ? "INVALID" : code.replace("TOKEN_", "");
    if (flow === "activation" && code === "TOKEN_USED") return AUTH_ERROR_MESSAGES.ACCOUNT_ALREADY_ACTIVATED;
    return AUTH_ERROR_MESSAGES[`${prefix}_TOKEN_${suffix}`] || fallback;
  }
  return (code ? AUTH_ERROR_MESSAGES[code] : null) || getApiErrorMessage(error, fallback);
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

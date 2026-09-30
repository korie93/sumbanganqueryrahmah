import { assessCredentialPassword } from "@shared/password-policy";
import { getAuthErrorCode } from "@/lib/auth-flow-feedback";
import {
  validatePasswordFields,
  type PublicAuthFieldErrors,
} from "@/pages/public-auth-form-utils";

type PasswordFieldValidationState = "neutral" | "success" | "error";

const PASSWORD_FEEDBACK_EN: Record<string, string> = {
  "Sila masukkan kata laluan semasa.": "Enter your current password.",
  "Sila masukkan kata laluan baharu.": "Enter your new password.",
  "Sila sahkan kata laluan baharu.": "Confirm your new password.",
  "Pengesahan kata laluan tidak sepadan.": "Password confirmation does not match.",
  "Sedang menyimpan kata laluan. Sila tunggu.": "Saving your password. Please wait.",
  "Masukkan kata laluan baharu mengikut keperluan di atas.": "Enter a new password that meets the requirements above.",
  "Kata laluan memenuhi semua syarat dan sepadan. Anda boleh teruskan.": "Your password meets all requirements and the confirmation matches. You can continue.",
};

export function localizePasswordFeedback(message: string, locale: "ms" | "en" = "ms"): string {
  const source = Object.keys(PASSWORD_FEEDBACK_EN).find((key) => key === message || PASSWORD_FEEDBACK_EN[key] === message);
  if (source) return locale === "en" ? PASSWORD_FEEDBACK_EN[source] : source;
  const msChecks = assessCredentialPassword("", "ms").checks;
  const enChecks = assessCredentialPassword("", "en").checks;
  const check = msChecks.find((entry) => entry.message === message)
    ?? enChecks.find((entry) => entry.message === message);
  return check ? assessCredentialPassword("", locale).checks.find((entry) => entry.code === check.code)?.message ?? message : message;
}

/** Visual state follows authoritative policy; confirmation only compares the two fields. */
export function getPasswordCreationValidationStates({
  newPassword,
  confirmPassword,
  newPasswordInteracted = false,
  newPasswordError = "",
  confirmPasswordError = "",
}: {
  newPassword: string;
  confirmPassword: string;
  newPasswordInteracted?: boolean;
  newPasswordError?: string;
  confirmPasswordError?: string;
}): { newPassword: PasswordFieldValidationState; confirmPassword: PasswordFieldValidationState } {
  return {
    newPassword: newPasswordError
      ? "error"
      : !newPasswordInteracted
        ? "neutral"
        : assessCredentialPassword(newPassword, "ms").valid ? "success" : "error",
    confirmPassword: confirmPasswordError
      ? "error"
      : !confirmPassword
        ? "neutral"
        : newPassword === confirmPassword ? "success" : "error",
  };
}

/** Known server codes use the shared policy copy, never raw server text. */
export function getPasswordCreationFieldErrors(error: unknown): PublicAuthFieldErrors {
  const code = getAuthErrorCode(error);
  if (code === "PASSWORD_CONFIRMATION_MISMATCH") {
    return { confirmPassword: "Pengesahan kata laluan tidak sepadan." };
  }

  const check = assessCredentialPassword("", "ms").checks.find((entry) => entry.code === code);
  return check ? { newPassword: check.message } : {};
}

export function getPasswordCreationSubmitHint({
  newPassword,
  confirmPassword,
  loading,
  newPasswordError = "",
  confirmPasswordError = "",
}: {
  newPassword: string;
  confirmPassword: string;
  loading: boolean;
  newPasswordError?: string;
  confirmPasswordError?: string;
}): string {
  if (loading) return "Sedang menyimpan kata laluan. Sila tunggu.";
  if (newPasswordError || confirmPasswordError) return newPasswordError || confirmPasswordError;
  if (!newPassword) return "Masukkan kata laluan baharu mengikut keperluan di atas.";

  const errors = validatePasswordFields({ newPassword, confirmPassword });
  if (errors.newPassword) return errors.newPassword;
  if (errors.confirmPassword) return errors.confirmPassword;
  return "Kata laluan memenuhi semua syarat dan sepadan. Anda boleh teruskan.";
}

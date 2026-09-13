import { assessCredentialPassword } from "@shared/password-policy";
import { getAuthErrorCode } from "@/lib/auth-flow-feedback";
import {
  validatePasswordFields,
  type PublicAuthFieldErrors,
} from "@/pages/public-auth-form-utils";

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

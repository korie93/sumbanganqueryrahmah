import { hasAuthIdentifier } from "@/pages/auth-field-utils";
import {
  PASSWORD_POLICY_ERROR_MESSAGE_MS,
  isStrongPassword,
} from "@shared/password-policy";

export type PublicAuthFieldErrors = {
  identifier?: string | undefined;
  currentPassword?: string | undefined;
  newPassword?: string | undefined;
  confirmPassword?: string | undefined;
};

type ValidatePasswordFieldsOptions = {
  currentPassword?: string | undefined;
  newPassword: string;
  confirmPassword: string;
  requireCurrentPassword?: boolean | undefined;
};

export function hasPublicAuthFieldErrors(errors: PublicAuthFieldErrors): boolean {
  return Boolean(
    errors.identifier
      || errors.currentPassword
      || errors.newPassword
      || errors.confirmPassword,
  );
}

export function validateIdentifierField(identifier: string): PublicAuthFieldErrors {
  return hasAuthIdentifier(identifier)
    ? {}
    : { identifier: "Sila masukkan username atau emel anda." };
}

export function validatePasswordFields({
  currentPassword,
  newPassword,
  confirmPassword,
  requireCurrentPassword = false,
}: ValidatePasswordFieldsOptions): PublicAuthFieldErrors {
  const errors: PublicAuthFieldErrors = {};

  if (requireCurrentPassword && !String(currentPassword || "").trim()) {
    errors.currentPassword = "Sila masukkan kata laluan semasa.";
  }

  if (!newPassword) {
    errors.newPassword = "Sila masukkan kata laluan baharu.";
  } else if (!isStrongPassword(newPassword)) {
    errors.newPassword = PASSWORD_POLICY_ERROR_MESSAGE_MS;
  }

  if (!confirmPassword) {
    errors.confirmPassword = "Sila sahkan kata laluan baharu.";
  } else if (newPassword && newPassword !== confirmPassword) {
    errors.confirmPassword = "Pengesahan kata laluan tidak sepadan.";
  }

  return errors;
}

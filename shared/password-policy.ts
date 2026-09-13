export const CREDENTIAL_PASSWORD_MIN_LENGTH = 14;
export const CREDENTIAL_PASSWORD_MAX_LENGTH = 256;
// Temporary credentials are only for forced-change/bootstrap flows. This must
// never replace the stronger policy for a password chosen by the user.
export const TEMPORARY_PASSWORD_LENGTH = 8;

const CREDENTIAL_PASSWORD_UPPERCASE_PATTERN = /[A-Z]/;
const CREDENTIAL_PASSWORD_LOWERCASE_PATTERN = /[a-z]/;
const CREDENTIAL_PASSWORD_NUMBER_PATTERN = /\d/;
const CREDENTIAL_PASSWORD_SYMBOL_PATTERN = /[^A-Za-z0-9]/;

export type CredentialPasswordIssueCode =
  | "PASSWORD_TOO_SHORT"
  | "PASSWORD_TOO_LONG"
  | "PASSWORD_MISSING_LETTER"
  | "PASSWORD_MISSING_UPPERCASE"
  | "PASSWORD_MISSING_LOWERCASE"
  | "PASSWORD_MISSING_NUMBER"
  | "PASSWORD_MISSING_SYMBOL";

export type CredentialPasswordValidationIssue = {
  code: CredentialPasswordIssueCode;
  message: string;
};

export function assessCredentialPassword(raw: string, locale: "en" | "ms" = "en") {
  const malay = locale === "ms";
  const checks: Array<CredentialPasswordValidationIssue & { valid: boolean }> = [
    {
      code: "PASSWORD_TOO_SHORT",
      valid: raw.length >= CREDENTIAL_PASSWORD_MIN_LENGTH,
      message: malay
        ? `Password mesti sekurang-kurangnya ${CREDENTIAL_PASSWORD_MIN_LENGTH} aksara.`
        : `Password must be at least ${CREDENTIAL_PASSWORD_MIN_LENGTH} characters.`,
    },
    {
      code: "PASSWORD_TOO_LONG",
      valid: isCredentialPasswordWithinMaxLength(raw),
      message: malay
        ? `Password tidak boleh melebihi ${CREDENTIAL_PASSWORD_MAX_LENGTH} aksara.`
        : `Password must not exceed ${CREDENTIAL_PASSWORD_MAX_LENGTH} characters.`,
    },
    {
      code: "PASSWORD_MISSING_LETTER",
      valid: /[A-Za-z]/.test(raw),
      message: malay
        ? "Password mesti mengandungi sekurang-kurangnya satu huruf."
        : "Password must contain at least one letter.",
    },
    {
      code: "PASSWORD_MISSING_UPPERCASE",
      valid: CREDENTIAL_PASSWORD_UPPERCASE_PATTERN.test(raw),
      message: malay
        ? "Password mesti mengandungi sekurang-kurangnya satu huruf besar."
        : "Password must contain at least one uppercase letter.",
    },
    {
      code: "PASSWORD_MISSING_LOWERCASE",
      valid: CREDENTIAL_PASSWORD_LOWERCASE_PATTERN.test(raw),
      message: malay
        ? "Password mesti mengandungi sekurang-kurangnya satu huruf kecil."
        : "Password must contain at least one lowercase letter.",
    },
    {
      code: "PASSWORD_MISSING_NUMBER",
      valid: CREDENTIAL_PASSWORD_NUMBER_PATTERN.test(raw),
      message: malay
        ? "Password mesti mengandungi sekurang-kurangnya satu nombor."
        : "Password must contain at least one number.",
    },
    {
      code: "PASSWORD_MISSING_SYMBOL",
      valid: CREDENTIAL_PASSWORD_SYMBOL_PATTERN.test(raw),
      message: malay
        ? "Password mesti mengandungi sekurang-kurangnya satu simbol."
        : "Password must contain at least one symbol.",
    },
  ];
  const errors = checks.filter((check) => !check.valid).map(({ code, message }) => ({ code, message }));
  return { valid: errors.length === 0, checks, errors };
}

export function getCredentialPasswordValidationIssues(
  raw: string,
  locale: "en" | "ms" = "en",
): CredentialPasswordValidationIssue[] {
  return assessCredentialPassword(raw, locale).errors;
}

export function getCredentialPasswordValidationError(
  raw: string,
  locale: "en" | "ms" = "en",
): CredentialPasswordValidationIssue | null {
  return getCredentialPasswordValidationIssues(raw, locale)[0] ?? null;
}

export function isTemporaryPasswordPolicyCompliant(raw: string): boolean {
  return raw.length === TEMPORARY_PASSWORD_LENGTH
    && /[A-Za-z]/.test(raw)
    && CREDENTIAL_PASSWORD_NUMBER_PATTERN.test(raw)
    && CREDENTIAL_PASSWORD_SYMBOL_PATTERN.test(raw);
}

export function isCredentialPasswordWithinMaxLength(raw: string): boolean {
  return raw.length <= CREDENTIAL_PASSWORD_MAX_LENGTH;
}

export function isCredentialPasswordPolicyCompliant(raw: string): boolean {
  return assessCredentialPassword(raw).valid;
}

export function getCredentialPasswordPolicyMessage(locale: "en" | "ms" = "en"): string {
  if (locale === "ms") {
    return `Password mesti antara ${CREDENTIAL_PASSWORD_MIN_LENGTH} hingga ${CREDENTIAL_PASSWORD_MAX_LENGTH} aksara dan mengandungi huruf besar, huruf kecil, nombor, serta simbol.`;
  }

  return `Password must be between ${CREDENTIAL_PASSWORD_MIN_LENGTH} and ${CREDENTIAL_PASSWORD_MAX_LENGTH} characters and include at least one uppercase letter, one lowercase letter, one number, and one symbol.`;
}

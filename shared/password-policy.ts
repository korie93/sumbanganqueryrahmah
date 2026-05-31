export const CREDENTIAL_PASSWORD_MIN_LENGTH = 14;
export const CREDENTIAL_PASSWORD_MAX_LENGTH = 256;

const CREDENTIAL_PASSWORD_UPPERCASE_PATTERN = /[A-Z]/;
const CREDENTIAL_PASSWORD_LOWERCASE_PATTERN = /[a-z]/;
const CREDENTIAL_PASSWORD_NUMBER_PATTERN = /\d/;
const CREDENTIAL_PASSWORD_SYMBOL_PATTERN = /[^A-Za-z0-9]/;

export function isCredentialPasswordWithinMaxLength(raw: string): boolean {
  return raw.length <= CREDENTIAL_PASSWORD_MAX_LENGTH;
}

export function isCredentialPasswordPolicyCompliant(raw: string): boolean {
  return (
    raw.length >= CREDENTIAL_PASSWORD_MIN_LENGTH
    && isCredentialPasswordWithinMaxLength(raw)
    && CREDENTIAL_PASSWORD_UPPERCASE_PATTERN.test(raw)
    && CREDENTIAL_PASSWORD_LOWERCASE_PATTERN.test(raw)
    && CREDENTIAL_PASSWORD_NUMBER_PATTERN.test(raw)
    && CREDENTIAL_PASSWORD_SYMBOL_PATTERN.test(raw)
  );
}

export function getCredentialPasswordPolicyMessage(locale: "en" | "ms" = "en"): string {
  if (locale === "ms") {
    return `Password mesti antara ${CREDENTIAL_PASSWORD_MIN_LENGTH} hingga ${CREDENTIAL_PASSWORD_MAX_LENGTH} aksara dan mengandungi huruf besar, huruf kecil, nombor, serta simbol.`;
  }

  return `Password must be between ${CREDENTIAL_PASSWORD_MIN_LENGTH} and ${CREDENTIAL_PASSWORD_MAX_LENGTH} characters and include at least one uppercase letter, one lowercase letter, one number, and one symbol.`;
}

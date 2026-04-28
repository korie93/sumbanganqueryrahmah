export const CREDENTIAL_PASSWORD_MIN_LENGTH = 8;
export const CREDENTIAL_PASSWORD_MAX_LENGTH = 256;

export function isCredentialPasswordWithinMaxLength(raw: string): boolean {
  return raw.length <= CREDENTIAL_PASSWORD_MAX_LENGTH;
}

export function isCredentialPasswordPolicyCompliant(raw: string): boolean {
  return (
    raw.length >= CREDENTIAL_PASSWORD_MIN_LENGTH
    && isCredentialPasswordWithinMaxLength(raw)
    && /[A-Za-z]/.test(raw)
    && /\d/.test(raw)
  );
}

export function getCredentialPasswordPolicyMessage(locale: "en" | "ms" = "en"): string {
  if (locale === "ms") {
    return `Password mesti antara ${CREDENTIAL_PASSWORD_MIN_LENGTH} hingga ${CREDENTIAL_PASSWORD_MAX_LENGTH} aksara dan mengandungi huruf serta nombor.`;
  }

  return `Password must be between ${CREDENTIAL_PASSWORD_MIN_LENGTH} and ${CREDENTIAL_PASSWORD_MAX_LENGTH} characters and include at least one letter and one number.`;
}

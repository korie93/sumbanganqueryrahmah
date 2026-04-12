export const CREDENTIAL_USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,32}$/

export const INVALID_CREDENTIAL_USERNAME_MESSAGE =
  "Username must match ^[a-zA-Z0-9._-]{3,32}$."

export const MANAGED_USER_EMAIL_REQUIRED_MESSAGE =
  "Email is required for account activation."

export function normalizeCredentialUsername(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase()
}

export function normalizeCredentialEmail(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase()
}

export function normalizeCredentialFullName(value: string | null | undefined): string {
  return String(value || "").trim()
}

export function validateCredentialUsername(value: string): string | null {
  return CREDENTIAL_USERNAME_REGEX.test(value) ? null : INVALID_CREDENTIAL_USERNAME_MESSAGE
}

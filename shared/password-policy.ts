export const PASSWORD_POLICY_MIN_LENGTH = 8;

export const PASSWORD_POLICY_ERROR_MESSAGE_EN =
  "Password must be at least 8 characters and include at least one uppercase letter, one lowercase letter, one number, and one special character.";

export const PASSWORD_POLICY_ERROR_MESSAGE_MS =
  "Password mesti sekurang-kurangnya 8 aksara dan mengandungi sekurang-kurangnya satu huruf besar, satu huruf kecil, satu nombor, dan satu aksara khas.";

export const PASSWORD_POLICY_HINT_MESSAGE_EN =
  "Use at least 8 characters with an uppercase letter, lowercase letter, number, and special character.";

export const PASSWORD_POLICY_HINT_MESSAGE_MS =
  "Gunakan sekurang-kurangnya 8 aksara dengan huruf besar, huruf kecil, nombor, dan aksara khas.";

export function isStrongPassword(value: string): boolean {
  const normalized = String(value ?? "");
  if (normalized.length < PASSWORD_POLICY_MIN_LENGTH) {
    return false;
  }

  return /[A-Z]/.test(normalized)
    && /[a-z]/.test(normalized)
    && /\d/.test(normalized)
    && /[^A-Za-z0-9\s]/.test(normalized);
}

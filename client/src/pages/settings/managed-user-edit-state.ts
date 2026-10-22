import type { ManagedUser } from "./types";
import {
  normalizeCredentialEmail,
  normalizeCredentialFullName,
  normalizeCredentialUsername,
  validateCredentialUsername,
} from "./settings-credential-validation";

type ManagedUserDraft = {
  fullName: string;
  username: string;
  email: string;
  role: string;
  status: string;
  isBanned: boolean;
};

type ManagedUserEditTarget = Pick<ManagedUser, keyof ManagedUserDraft>;

// Presentation/early feedback only. Identity uniqueness, access checks and all
// mutation validation remain authoritative on the backend.
export function getManagedUserEditState(target: ManagedUserEditTarget | null, draft: ManagedUserDraft) {
  const profilePayload: { username?: string; fullName?: string | null; email?: string | null } = {};
  const errors: { username?: string; email?: string } = {};
  if (!target) return { profilePayload, errors, roleChanged: false, statusChanged: false, hasChanges: false, canSave: false };

  const fullName = normalizeCredentialFullName(draft.fullName);
  const username = normalizeCredentialUsername(draft.username);
  const email = normalizeCredentialEmail(draft.email);
  // Compare semantic values, not casing or padding. Untouched legacy identity
  // fields are omitted and must not block an unrelated role/status change.
  if (fullName !== normalizeCredentialFullName(target.fullName)) profilePayload.fullName = fullName || null;
  if (username !== normalizeCredentialUsername(target.username)) {
    profilePayload.username = username;
    if (validateCredentialUsername(username)) {
      errors.username = "Use 3–32 letters, numbers, dots, hyphens or underscores.";
    }
  }
  if (email !== normalizeCredentialEmail(target.email)) {
    profilePayload.email = email || null;
    // Mirrors server/auth/credentials.ts and the pending-account email rule.
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = "Enter a valid email address, such as name@example.com.";
    } else if (!email && target.status === "pending_activation") {
      errors.email = "Pending accounts require an email address for activation.";
    }
  }
  const roleChanged = draft.role !== target.role;
  const statusChanged = draft.status !== target.status || draft.isBanned !== Boolean(target.isBanned);
  const hasChanges = Object.keys(profilePayload).length > 0 || roleChanged || statusChanged;
  return { profilePayload, errors, roleChanged, statusChanged, hasChanges,
    canSave: hasChanges && !errors.username && !errors.email };
}

import type { ManagedUser } from "@/pages/settings/types";
import type { ManagedUserCreateDraft } from "@/pages/settings/settings-managed-user-create-shared";
import {
  MANAGED_USER_EMAIL_REQUIRED_MESSAGE,
  normalizeCredentialEmail,
  normalizeCredentialFullName,
  normalizeCredentialUsername,
  validateCredentialUsername,
} from "@/pages/settings/settings-credential-validation";

export function normalizeManagedUserCreateDraft(draft: ManagedUserCreateDraft) {
  return {
    normalizedEmail: normalizeCredentialEmail(draft.createEmailInput),
    normalizedFullName: normalizeCredentialFullName(draft.createFullNameInput),
    normalizedUsername: normalizeCredentialUsername(draft.createUsernameInput),
    role: draft.createRoleInput,
  };
}

export function validateManagedUserCreateDraft(draft: ManagedUserCreateDraft) {
  const normalized = normalizeManagedUserCreateDraft(draft);
  const usernameValidationError = validateCredentialUsername(normalized.normalizedUsername);

  if (usernameValidationError) {
    return usernameValidationError;
  }

  if (!normalized.normalizedEmail) {
    return MANAGED_USER_EMAIL_REQUIRED_MESSAGE;
  }

  return null;
}

export function findDuplicateManagedUser(options: {
  normalizedEmail: string;
  normalizedUsername: string;
  users: ManagedUser[];
}) {
  return options.users.find((user) => {
    const sameUsername = normalizeCredentialUsername(user.username) === options.normalizedUsername;
    const sameEmail =
      options.normalizedEmail !== ""
      && normalizeCredentialEmail(user.email) === options.normalizedEmail;

    return sameUsername || sameEmail;
  });
}

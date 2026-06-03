import type { ManagedUser } from "@/pages/settings/types";
import type { ManagedUserCreateDraft } from "@/pages/settings/settings-managed-user-create-shared";
import {
  MANAGED_USER_EMAIL_REQUIRED_MESSAGE,
  normalizeCredentialEmail,
  normalizeCredentialFullName,
  normalizeCredentialUsername,
  validateCredentialUsername,
} from "@/pages/settings/settings-credential-validation";

export type ManagedUserCreateFieldErrors = Partial<Record<
  "createUsernameInput" | "createEmailInput",
  string
>>;

export function normalizeManagedUserCreateDraft(draft: ManagedUserCreateDraft) {
  return {
    normalizedEmail: normalizeCredentialEmail(draft.createEmailInput),
    normalizedFullName: normalizeCredentialFullName(draft.createFullNameInput),
    normalizedUsername: normalizeCredentialUsername(draft.createUsernameInput),
    role: draft.createRoleInput,
  };
}

export function validateManagedUserCreateDraftFields(
  draft: ManagedUserCreateDraft,
): ManagedUserCreateFieldErrors {
  const normalized = normalizeManagedUserCreateDraft(draft);
  const usernameValidationError = validateCredentialUsername(normalized.normalizedUsername);
  const errors: ManagedUserCreateFieldErrors = {};

  if (usernameValidationError) {
    errors.createUsernameInput = usernameValidationError;
  }

  if (!normalized.normalizedEmail) {
    errors.createEmailInput = MANAGED_USER_EMAIL_REQUIRED_MESSAGE;
  }

  return errors;
}

export function validateManagedUserCreateDraft(draft: ManagedUserCreateDraft) {
  const errors = validateManagedUserCreateDraftFields(draft);

  return errors.createUsernameInput ?? errors.createEmailInput ?? null;
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

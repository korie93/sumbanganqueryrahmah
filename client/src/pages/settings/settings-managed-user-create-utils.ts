import { CREDENTIAL_USERNAME_REGEX } from "@/pages/settings/utils";
import type { ManagedUser } from "@/pages/settings/types";
import type { ManagedUserCreateDraft } from "@/pages/settings/settings-managed-user-create-shared";

export function normalizeManagedUserCreateDraft(draft: ManagedUserCreateDraft) {
  return {
    normalizedEmail: draft.createEmailInput.trim().toLowerCase(),
    normalizedFullName: draft.createFullNameInput.trim(),
    normalizedUsername: draft.createUsernameInput.trim().toLowerCase(),
    role: draft.createRoleInput,
  };
}

export function validateManagedUserCreateDraft(draft: ManagedUserCreateDraft) {
  const normalized = normalizeManagedUserCreateDraft(draft);

  if (!CREDENTIAL_USERNAME_REGEX.test(normalized.normalizedUsername)) {
    return "Username must match ^[a-zA-Z0-9._-]{3,32}$.";
  }

  if (!normalized.normalizedEmail) {
    return "Email is required for account activation.";
  }

  return null;
}

export function findDuplicateManagedUser(options: {
  normalizedEmail: string;
  normalizedUsername: string;
  users: ManagedUser[];
}) {
  return options.users.find((user) => {
    const sameUsername = user.username.toLowerCase() === options.normalizedUsername;
    const sameEmail =
      options.normalizedEmail !== ""
      && String(user.email || "").trim().toLowerCase() === options.normalizedEmail;

    return sameUsername || sameEmail;
  });
}

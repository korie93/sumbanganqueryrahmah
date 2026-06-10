import type { ManagedUser } from "@/pages/settings/types";
import type {
  ManagedUserCreateDraft,
  ManagedUserCreateReadinessItem,
  ManagedUserCreateRole,
  ManagedUserCreateRoleGuidance,
} from "@/pages/settings/settings-managed-user-create-shared";
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

export function getManagedUserCreateRoleGuidance(
  role: ManagedUserCreateRole,
): ManagedUserCreateRoleGuidance {
  if (role === "admin") {
    return {
      description: "Administrative access. Use only for trusted operators who manage settings.",
      label: "Admin access",
      tone: "warning",
    };
  }

  if (role === "manager") {
    return {
      description: "Read-focused operational access without superuser powers.",
      label: "Manager access",
      tone: "neutral",
    };
  }

  return {
    description: "Standard workspace access after the user completes activation.",
    label: "User access",
    tone: "neutral",
  };
}

export function buildManagedUserCreateReadiness(
  draft: ManagedUserCreateDraft,
): ManagedUserCreateReadinessItem[] {
  const normalized = normalizeManagedUserCreateDraft(draft);

  return [
    {
      id: "username",
      label: "Username ready",
      ready: validateCredentialUsername(normalized.normalizedUsername) === null,
    },
    {
      id: "email",
      label: "Activation email ready",
      ready: normalized.normalizedEmail.length > 0,
    },
    {
      id: "role",
      label: "Role selected",
      ready: normalized.role === "admin" || normalized.role === "manager" || normalized.role === "user",
    },
  ];
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

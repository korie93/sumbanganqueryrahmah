import { useCallback, useState } from "react";
import type {
  ManagedUserCreateDraft,
  ManagedUserCreateRole,
} from "@/pages/settings/settings-managed-user-create-shared";
import {
  type ManagedUserCreateFieldErrors,
  validateManagedUserCreateDraftFields,
} from "@/pages/settings/settings-managed-user-create-utils";

export function useSettingsManagedUserCreateFormState() {
  const [createFullNameInput, setCreateFullNameInput] = useState("");
  const [createUsernameInput, setCreateUsernameInputState] = useState("");
  const [createEmailInput, setCreateEmailInputState] = useState("");
  const [createRoleInput, setCreateRoleInput] = useState<ManagedUserCreateRole>("user");
  const [createFieldErrors, setCreateFieldErrors] = useState<ManagedUserCreateFieldErrors>({});

  const setCreateUsernameInput = useCallback((value: string) => {
    setCreateUsernameInputState(value);
    setCreateFieldErrors((current) => {
      const next = { ...current };
      delete next.createUsernameInput;
      return next;
    });
  }, []);

  const setCreateEmailInput = useCallback((value: string) => {
    setCreateEmailInputState(value);
    setCreateFieldErrors((current) => {
      const next = { ...current };
      delete next.createEmailInput;
      return next;
    });
  }, []);

  const resetCreateManagedUserForm = useCallback(() => {
    setCreateFullNameInput("");
    setCreateUsernameInputState("");
    setCreateEmailInputState("");
    setCreateRoleInput("user");
    setCreateFieldErrors({});
  }, []);

  const draft: ManagedUserCreateDraft = {
    createEmailInput,
    createFullNameInput,
    createRoleInput,
    createUsernameInput,
  };

  const applyCreateFieldErrors = useCallback((errors: ManagedUserCreateFieldErrors) => {
    setCreateFieldErrors(errors);
  }, []);

  const validateCreateField = useCallback((
    field: keyof ManagedUserCreateFieldErrors,
  ) => {
    const errors = validateManagedUserCreateDraftFields({
      createEmailInput,
      createFullNameInput,
      createRoleInput,
      createUsernameInput,
    });
    setCreateFieldErrors((current) => {
      const next = { ...current };
      const error = errors[field];
      if (error) {
        next[field] = error;
      } else {
        delete next[field];
      }
      return next;
    });
  }, [createEmailInput, createFullNameInput, createRoleInput, createUsernameInput]);

  return {
    applyCreateFieldErrors,
    createEmailInput,
    createFieldErrors,
    createFullNameInput,
    createRoleInput,
    createUsernameInput,
    draft,
    resetCreateManagedUserForm,
    setCreateEmailInput,
    setCreateFullNameInput,
    setCreateRoleInput,
    setCreateUsernameInput,
    validateCreateField,
  };
}

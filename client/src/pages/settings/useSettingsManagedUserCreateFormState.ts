import { useCallback, useState } from "react";
import type {
  ManagedUserCreateDraft,
  ManagedUserCreateRole,
} from "@/pages/settings/settings-managed-user-create-shared";

export function useSettingsManagedUserCreateFormState() {
  const [createFullNameInput, setCreateFullNameInput] = useState("");
  const [createUsernameInput, setCreateUsernameInput] = useState("");
  const [createEmailInput, setCreateEmailInput] = useState("");
  const [createRoleInput, setCreateRoleInput] = useState<ManagedUserCreateRole>("user");

  const resetCreateManagedUserForm = useCallback(() => {
    setCreateFullNameInput("");
    setCreateUsernameInput("");
    setCreateEmailInput("");
    setCreateRoleInput("user");
  }, []);

  const draft: ManagedUserCreateDraft = {
    createEmailInput,
    createFullNameInput,
    createRoleInput,
    createUsernameInput,
  };

  return {
    createEmailInput,
    createFullNameInput,
    createRoleInput,
    createUsernameInput,
    draft,
    resetCreateManagedUserForm,
    setCreateEmailInput,
    setCreateFullNameInput,
    setCreateRoleInput,
    setCreateUsernameInput,
  };
}

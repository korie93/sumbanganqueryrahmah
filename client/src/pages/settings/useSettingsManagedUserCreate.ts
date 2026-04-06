import type { UseSettingsManagedUserCreateArgs } from "@/pages/settings/settings-managed-user-create-shared";
import { useSettingsManagedUserCreateFormState } from "@/pages/settings/useSettingsManagedUserCreateFormState";
import { useSettingsManagedUserCreateSubmitAction } from "@/pages/settings/useSettingsManagedUserCreateSubmitAction";

export function useSettingsManagedUserCreate({
  isMountedRef,
  loadDevMailOutbox,
  loadManagedUsers,
  openManagedSecretDialog,
  toast,
}: UseSettingsManagedUserCreateArgs) {
  const formState = useSettingsManagedUserCreateFormState();
  const submitAction = useSettingsManagedUserCreateSubmitAction({
    createDraft: formState.draft,
    isMountedRef,
    loadDevMailOutbox,
    loadManagedUsers,
    openManagedSecretDialog,
    resetCreateManagedUserForm: formState.resetCreateManagedUserForm,
    toast,
  });

  return {
    createEmailInput: formState.createEmailInput,
    createFullNameInput: formState.createFullNameInput,
    createRoleInput: formState.createRoleInput,
    createUsernameInput: formState.createUsernameInput,
    creatingManagedUser: submitAction.creatingManagedUser,
    handleCreateManagedUser: submitAction.handleCreateManagedUser,
    setCreateEmailInput: formState.setCreateEmailInput,
    setCreateFullNameInput: formState.setCreateFullNameInput,
    setCreateRoleInput: formState.setCreateRoleInput,
    setCreateUsernameInput: formState.setCreateUsernameInput,
  };
}

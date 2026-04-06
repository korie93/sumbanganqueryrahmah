import { useMemo } from "react";
import {
  buildManagedDialogViewModel,
  buildManagedSecretDialogViewModel,
} from "@/pages/settings/settings-controller-view-models";
import type { useSettingsAccountManagement } from "@/pages/settings/useSettingsAccountManagement";

type AccountManagementState = ReturnType<typeof useSettingsAccountManagement>;

type UseSettingsManagedDialogViewModelsArgs = {
  accountManagement: AccountManagementState;
  confirmCriticalOpen: boolean;
  onConfirmCriticalOpenChange: (open: boolean) => void;
  onSaveCriticalSettings: () => Promise<void>;
  saving: boolean;
};

export function useSettingsManagedDialogViewModels({
  accountManagement,
  confirmCriticalOpen,
  onConfirmCriticalOpenChange,
  onSaveCriticalSettings,
  saving,
}: UseSettingsManagedDialogViewModelsArgs) {
  const managedDialog = useMemo(
    () =>
      buildManagedDialogViewModel({
        confirmCriticalOpen,
        managedDialogOpen: accountManagement.managedDialogOpen,
        managedEmailInput: accountManagement.managedEmailInput,
        managedFullNameInput: accountManagement.managedFullNameInput,
        managedIsBanned: accountManagement.managedIsBanned,
        managedRoleInput: accountManagement.managedRoleInput,
        managedSaving: accountManagement.managedSaving,
        managedSelectedUser: accountManagement.managedSelectedUser,
        managedStatusInput: accountManagement.managedStatusInput,
        managedUsernameInput: accountManagement.managedUsernameInput,
        onCloseManagedDialog: () => accountManagement.handleManagedDialogChange(false),
        onConfirmCriticalOpenChange,
        onConfirmManagedSave: () => void accountManagement.handleSaveManagedUser(),
        onManagedDialogOpenChange: accountManagement.handleManagedDialogChange,
        onManagedEmailInputChange: accountManagement.setManagedEmailInput,
        onManagedFullNameInputChange: accountManagement.setManagedFullNameInput,
        onManagedIsBannedChange: accountManagement.setManagedIsBanned,
        onManagedRoleInputChange: accountManagement.setManagedRoleInput,
        onManagedStatusInputChange: accountManagement.setManagedStatusInput,
        onManagedUsernameInputChange: accountManagement.setManagedUsernameInput,
        onSaveCriticalSettings,
        saving,
      }),
    [
      accountManagement.handleManagedDialogChange,
      accountManagement.handleSaveManagedUser,
      accountManagement.managedDialogOpen,
      accountManagement.managedEmailInput,
      accountManagement.managedFullNameInput,
      accountManagement.managedIsBanned,
      accountManagement.managedRoleInput,
      accountManagement.managedSaving,
      accountManagement.managedSelectedUser,
      accountManagement.managedStatusInput,
      accountManagement.managedUsernameInput,
      accountManagement.setManagedEmailInput,
      accountManagement.setManagedFullNameInput,
      accountManagement.setManagedIsBanned,
      accountManagement.setManagedRoleInput,
      accountManagement.setManagedStatusInput,
      accountManagement.setManagedUsernameInput,
      confirmCriticalOpen,
      onConfirmCriticalOpenChange,
      onSaveCriticalSettings,
      saving,
    ],
  );

  const managedSecretDialog = useMemo(
    () =>
      buildManagedSecretDialogViewModel({
        description: accountManagement.managedSecretDialogDescription,
        onOpenChange: accountManagement.setManagedSecretDialogOpen,
        open: accountManagement.managedSecretDialogOpen,
        title: accountManagement.managedSecretDialogTitle,
        value: accountManagement.managedSecretDialogValue,
      }),
    [
      accountManagement.managedSecretDialogDescription,
      accountManagement.managedSecretDialogOpen,
      accountManagement.managedSecretDialogTitle,
      accountManagement.managedSecretDialogValue,
      accountManagement.setManagedSecretDialogOpen,
    ],
  );

  return {
    managedDialog,
    managedSecretDialog,
  };
}

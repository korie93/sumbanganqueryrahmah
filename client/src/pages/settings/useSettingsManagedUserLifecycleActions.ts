import type { UseSettingsManagedUserLifecycleActionsArgs } from "@/pages/settings/settings-managed-user-lifecycle-shared";
import { useSettingsManagedUserAccountLifecycleActions } from "@/pages/settings/useSettingsManagedUserAccountLifecycleActions";
import { useSettingsManagedUserCommunicationActions } from "@/pages/settings/useSettingsManagedUserCommunicationActions";

export function useSettingsManagedUserLifecycleActions({
  isMountedRef,
  loadDevMailOutbox,
  loadManagedUsers,
  loadPendingResetRequests,
  managedSelectedUser,
  onManagedDialogOpenChange,
  openManagedSecretDialog,
  toast,
}: UseSettingsManagedUserLifecycleActionsArgs) {
  const communicationActions = useSettingsManagedUserCommunicationActions({
    loadDevMailOutbox,
    loadManagedUsers,
    loadPendingResetRequests,
    openManagedSecretDialog,
    toast,
  });
  const accountLifecycleActions = useSettingsManagedUserAccountLifecycleActions({
    isMountedRef,
    loadManagedUsers,
    loadPendingResetRequests,
    managedSelectedUser,
    onManagedDialogOpenChange,
    toast,
  });

  return {
    deletingManagedUserId: accountLifecycleActions.deletingManagedUserId,
    handleDeleteManagedUser: accountLifecycleActions.handleDeleteManagedUser,
    handleManagedBanToggle: accountLifecycleActions.handleManagedBanToggle,
    handleResendManagedUserActivation: communicationActions.handleResendManagedUserActivation,
    handleResetManagedUserPassword: communicationActions.handleResetManagedUserPassword,
  };
}

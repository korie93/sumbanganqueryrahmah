import type { MutableRefObject } from "react";
import { useSettingsDevMailOutbox } from "@/pages/settings/useSettingsDevMailOutbox";
import { useSettingsManagedDialogs } from "@/pages/settings/useSettingsManagedDialogs";
import { useSettingsManagedUserData } from "@/pages/settings/useSettingsManagedUserData";
import { useSettingsManagedUserMutations } from "@/pages/settings/useSettingsManagedUserMutations";

type ToastFn = (payload: {
  title: string;
  description: string;
  variant?: "default" | "destructive";
}) => void;

type UseSettingsAccountManagementArgs = {
  isMountedRef: MutableRefObject<boolean>;
  toast: ToastFn;
};

export function useSettingsAccountManagement({
  isMountedRef,
  toast,
}: UseSettingsAccountManagementArgs) {
  const managedUserData = useSettingsManagedUserData({
    isMountedRef,
    toast,
  });
  const {
    loadManagedUsers,
    loadPendingResetRequests,
    managedUsers,
    managedUsersLoading,
    managedUsersPagination,
    managedUsersQuery,
    pendingResetRequests,
    pendingResetRequestsLoading,
    pendingResetRequestsPagination,
    pendingResetRequestsQuery,
    refreshManagedUsersSection,
    refreshPendingResetRequestsSection,
    updateManagedUsersQuery,
    updatePendingResetRequestsQuery,
  } = managedUserData;

  const devMailOutbox = useSettingsDevMailOutbox({
    isMountedRef,
    toast,
  });
  const {
    clearingDevMailOutbox,
    deletingDevMailOutboxId,
    devMailOutboxEnabled,
    devMailOutboxEntries,
    devMailOutboxLoading,
    devMailOutboxPagination,
    devMailOutboxQuery,
    handleClearDevMailOutbox,
    handleDeleteDevMailOutboxEntry,
    loadDevMailOutbox,
    refreshDevMailOutboxSection,
    updateDevMailOutboxQuery,
  } = devMailOutbox;

  const managedDialogs = useSettingsManagedDialogs();
  const {
    handleManagedDialogChange,
    managedDialogOpen,
    managedEmailInput,
    managedFullNameInput,
    managedIsBanned,
    managedRoleInput,
    managedSaving,
    managedSecretDialogDescription,
    managedSecretDialogOpen,
    managedSecretDialogTitle,
    managedSecretDialogValue,
    managedSelectedUser,
    managedStatusInput,
    managedUsernameInput,
    openManagedEditor,
    openManagedSecretDialog,
    setManagedEmailInput,
    setManagedFullNameInput,
    setManagedIsBanned,
    setManagedRoleInput,
    setManagedSaving,
    setManagedSecretDialogOpen,
    setManagedStatusInput,
    setManagedUsernameInput,
  } = managedDialogs;

  const managedUserMutations = useSettingsManagedUserMutations({
    isMountedRef,
    toast,
    loadDevMailOutbox,
    loadManagedUsers,
    loadPendingResetRequests,
    managedEmailInput,
    managedFullNameInput,
    managedIsBanned,
    managedRoleInput,
    managedSaving,
    managedSelectedUser,
    managedStatusInput,
    managedUsernameInput,
    onManagedDialogOpenChange: handleManagedDialogChange,
    openManagedSecretDialog,
    setManagedSaving,
  });
  const {
    createEmailInput,
    createFullNameInput,
    createRoleInput,
    createUsernameInput,
    creatingManagedUser,
    deletingManagedUserId,
    handleCreateManagedUser,
    handleDeleteManagedUser,
    handleManagedBanToggle,
    handleResendManagedUserActivation,
    handleResetManagedUserPassword,
    handleSaveManagedUser,
    setCreateEmailInput,
    setCreateFullNameInput,
    setCreateRoleInput,
    setCreateUsernameInput,
  } = managedUserMutations;

  return {
    createEmailInput,
    createFullNameInput,
    createRoleInput,
    createUsernameInput,
    creatingManagedUser,
    deletingDevMailOutboxId,
    deletingManagedUserId,
    devMailOutboxEnabled,
    devMailOutboxEntries,
    devMailOutboxLoading,
    devMailOutboxPagination,
    devMailOutboxQuery,
    managedDialogOpen,
    managedEmailInput,
    managedFullNameInput,
    managedIsBanned,
    managedRoleInput,
    managedSaving,
    managedSecretDialogDescription,
    managedSecretDialogOpen,
    managedSecretDialogTitle,
    managedSecretDialogValue,
    managedSelectedUser,
    managedStatusInput,
    managedUsernameInput,
    managedUsers,
    managedUsersLoading,
    managedUsersPagination,
    managedUsersQuery,
    pendingResetRequests,
    pendingResetRequestsLoading,
    pendingResetRequestsPagination,
    pendingResetRequestsQuery,
    clearingDevMailOutbox,
    handleClearDevMailOutbox,
    handleCreateManagedUser,
    handleDeleteDevMailOutboxEntry,
    handleDeleteManagedUser,
    handleManagedBanToggle,
    handleManagedDialogChange,
    handleResendManagedUserActivation,
    handleResetManagedUserPassword,
    handleSaveManagedUser,
    loadDevMailOutbox,
    loadManagedUsers,
    loadPendingResetRequests,
    openManagedEditor,
    openManagedSecretDialog,
    refreshDevMailOutboxSection,
    updateDevMailOutboxQuery,
    refreshManagedUsersSection,
    refreshPendingResetRequestsSection,
    updateManagedUsersQuery,
    updatePendingResetRequestsQuery,
    setCreateEmailInput,
    setCreateFullNameInput,
    setCreateRoleInput,
    setCreateUsernameInput,
    setManagedEmailInput,
    setManagedFullNameInput,
    setManagedIsBanned,
    setManagedRoleInput,
    setManagedSecretDialogOpen,
    setManagedStatusInput,
    setManagedUsernameInput,
  };
}

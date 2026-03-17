import { useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { useSettingsAccountManagement } from "@/pages/settings/useSettingsAccountManagement";
import { useSettingsBootstrap } from "@/pages/settings/useSettingsBootstrap";
import {
  buildManagedDialogViewModel,
  buildManagedSecretDialogViewModel,
  buildSettingsSecurityViewModel,
} from "@/pages/settings/settings-controller-view-models";
import { useSettingsMyAccount } from "@/pages/settings/useSettingsMyAccount";
import { useSettingsSystemSettings } from "@/pages/settings/useSettingsSystemSettings";
import type { ManagedUser } from "@/pages/settings/types";

export function useSettingsController() {
  const { toast } = useToast();
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const myAccount = useSettingsMyAccount({
    isMountedRef,
    toast,
  });
  const {
    confirmPasswordInput,
    currentPasswordInput,
    currentUser,
    handleChangePassword,
    handleChangeUsername,
    hydrateCurrentUser,
    newPasswordInput,
    passwordSaving,
    setConfirmPasswordInput,
    setCurrentPasswordInput,
    setNewPasswordInput,
    setUsernameInput,
    usernameInput,
    usernameSaving,
  } = myAccount;
  const canEditSystemSettings =
    currentUser?.role === "admin" || currentUser?.role === "superuser";
  const isSuperuser = currentUser?.role === "superuser";
  const canAccessAccountSecurity = currentUser?.role === "superuser";
  const currentUserRole = currentUser?.role ?? "";

  const systemSettings = useSettingsSystemSettings({
    isMountedRef,
    toast,
  });
  const {
    categories,
    categoryDirtyMap,
    clearSettingsState,
    confirmCriticalOpen,
    currentCategory,
    dirtyCount,
    handleSave,
    isRolePermissionCategory,
    isSecurityCategory,
    loadSettings,
    loading,
    persistChanges,
    renderSettingCard,
    roleSections,
    saving,
    selectedCategory,
    setConfirmCriticalOpen,
    setSelectedCategory,
  } = systemSettings;

  const accountManagement = useSettingsAccountManagement({
    isMountedRef,
    toast,
  });
  const {
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
    pendingResetRequests,
    pendingResetRequestsLoading,
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
    refreshDevMailOutboxSection,
    refreshManagedUsersSection,
    refreshPendingResetRequestsSection,
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
  } = accountManagement;

  const { profileLoading } = useSettingsBootstrap({
    clearSettingsState,
    hydrateCurrentUser,
    isMountedRef,
    loadDevMailOutbox,
    loadManagedUsers,
    loadPendingResetRequests,
    loadSettings,
    toast,
  });

  const security = buildSettingsSecurityViewModel({
    clearingDevMailOutbox,
    confirmPasswordInput,
    createEmailInput,
    createFullNameInput,
    createRoleInput,
    createUsernameInput,
    creatingManagedUser,
    currentPasswordInput,
    currentUserRole,
    deletingDevMailOutboxId,
    deletingManagedUserId,
    devMailOutboxEnabled,
    devMailOutboxEntries,
    devMailOutboxLoading,
    isSuperuser,
    managedUsers,
    managedUsersLoading,
    newPasswordInput,
    onChangePassword: () => void handleChangePassword(),
    onChangeUsername: () => void handleChangeUsername(),
    onClearDevMailOutbox: () => void handleClearDevMailOutbox(),
    onConfirmPasswordInputChange: setConfirmPasswordInput,
    onCreateEmailInputChange: setCreateEmailInput,
    onCreateFullNameInputChange: setCreateFullNameInput,
    onCreateManagedUser: () => void handleCreateManagedUser(),
    onCreateRoleInputChange: setCreateRoleInput,
    onCreateUsernameInputChange: setCreateUsernameInput,
    onCurrentPasswordInputChange: setCurrentPasswordInput,
    onDeleteDevMailOutboxEntry: (previewId: string) =>
      void handleDeleteDevMailOutboxEntry(previewId),
    onDeleteManagedUser: (user: ManagedUser) => void handleDeleteManagedUser(user),
    onDevMailOutboxRefresh: () => void refreshDevMailOutboxSection(),
    onEditManagedUser: openManagedEditor,
    onManagedBanToggle: (user: ManagedUser) => void handleManagedBanToggle(user),
    onManagedResetPassword: (user: ManagedUser) => void handleResetManagedUserPassword(user),
    onManagedResendActivation: (user: ManagedUser) =>
      void handleResendManagedUserActivation(user),
    onManagedUsersRefresh: () => void refreshManagedUsersSection(),
    onNewPasswordInputChange: setNewPasswordInput,
    onPendingResetRequestsRefresh: () => void refreshPendingResetRequestsSection(),
    onUsernameInputChange: setUsernameInput,
    passwordSaving,
    pendingResetRequests,
    pendingResetRequestsLoading,
    usernameInput,
    usernameSaving,
  });

  const managedDialog = buildManagedDialogViewModel({
    confirmCriticalOpen,
    managedDialogOpen,
    managedEmailInput,
    managedFullNameInput,
    managedIsBanned,
    managedRoleInput,
    managedSaving,
    managedSelectedUser,
    managedStatusInput,
    managedUsernameInput,
    onCloseManagedDialog: () => handleManagedDialogChange(false),
    onConfirmCriticalOpenChange: setConfirmCriticalOpen,
    onConfirmManagedSave: () => void handleSaveManagedUser(),
    onManagedDialogOpenChange: handleManagedDialogChange,
    onManagedEmailInputChange: setManagedEmailInput,
    onManagedFullNameInputChange: setManagedFullNameInput,
    onManagedIsBannedChange: setManagedIsBanned,
    onManagedRoleInputChange: setManagedRoleInput,
    onManagedStatusInputChange: setManagedStatusInput,
    onManagedUsernameInputChange: setManagedUsernameInput,
    onSaveCriticalSettings: async () => {
      await persistChanges(true);
    },
    saving,
  });

  const managedSecretDialog = buildManagedSecretDialogViewModel({
    description: managedSecretDialogDescription,
    onOpenChange: setManagedSecretDialogOpen,
    open: managedSecretDialogOpen,
    title: managedSecretDialogTitle,
    value: managedSecretDialogValue,
  });

  return {
    currentUser,
    profileLoading,
    canEditSystemSettings,
    canAccessAccountSecurity,
    isSuperuser,
    currentUserRole,
    categories,
    selectedCategory,
    setSelectedCategory,
    currentCategory,
    isRolePermissionCategory,
    isSecurityCategory,
    roleSections,
    categoryDirtyMap,
    dirtyCount,
    saving,
    renderSettingCard,
    saveBar: {
      dirtyCount,
      saving,
      onSave: () => void handleSave(),
    },
    security,
    managedDialog,
    managedSecretDialog,
    loadingState: {
      loading,
      profileLoading,
    },
  };
}

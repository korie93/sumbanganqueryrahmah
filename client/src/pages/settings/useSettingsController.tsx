import { useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import type { TabVisibility } from "@/app/types";
import type { UserAccountManagementSectionProps } from "@/pages/settings/UserAccountManagementSection";
import { useSettingsAccountManagement } from "@/pages/settings/useSettingsAccountManagement";
import { useSettingsBootstrap } from "@/pages/settings/useSettingsBootstrap";
import {
  buildManagedDialogViewModel,
  buildManagedSecretDialogViewModel,
  buildSettingsSecurityViewModel,
} from "@/pages/settings/settings-controller-view-models";
import { useSettingsMyAccount } from "@/pages/settings/useSettingsMyAccount";
import { useSettingsSystemSettings } from "@/pages/settings/useSettingsSystemSettings";
import type { ManagedUser, SettingCategory } from "@/pages/settings/types";

const ACCOUNT_MANAGEMENT_CATEGORY_ID = "account-management";
export const BACKUP_SETTINGS_CATEGORY_ID = "backup-restore";

type UseSettingsControllerArgs = {
  initialSectionId?: string;
  tabVisibility?: TabVisibility;
};

function canAccessBackupCategory(role: string | undefined, tabVisibility: TabVisibility | undefined) {
  if (!role) return false;
  if (role === "superuser") return true;
  if (!tabVisibility) return true;
  return tabVisibility.backup !== false;
}

export function useSettingsController({
  initialSectionId,
  tabVisibility,
}: UseSettingsControllerArgs = {}) {
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
  const canAccessAccountManagement = currentUser?.role === "superuser";
  const currentUserRole = currentUser?.role ?? "";
  const canAccessBackupSection = canAccessBackupCategory(currentUser?.role, tabVisibility);

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

  const accountManagementSection: UserAccountManagementSectionProps = {
    clearingDevMailOutbox,
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
    isSuperuser,
    managedUsers,
    managedUsersLoading,
    onClearDevMailOutbox: () => void handleClearDevMailOutbox(),
    onCreateEmailInputChange: setCreateEmailInput,
    onCreateFullNameInputChange: setCreateFullNameInput,
    onCreateManagedUser: () => void handleCreateManagedUser(),
    onCreateRoleInputChange: setCreateRoleInput,
    onCreateUsernameInputChange: setCreateUsernameInput,
    onDeleteDevMailOutboxEntry: (previewId) => void handleDeleteDevMailOutboxEntry(previewId),
    onDeleteManagedUser: (user) => void handleDeleteManagedUser(user),
    onDevMailOutboxRefresh: () => void refreshDevMailOutboxSection(),
    onEditManagedUser: openManagedEditor,
    onManagedBanToggle: (user) => void handleManagedBanToggle(user),
    onManagedResetPassword: (user) => void handleResetManagedUserPassword(user),
    onManagedResendActivation: (user) => void handleResendManagedUserActivation(user),
    onManagedUsersRefresh: () => void refreshManagedUsersSection(),
    onPendingResetRequestsRefresh: () => void refreshPendingResetRequestsSection(),
    pendingResetRequests,
    pendingResetRequestsLoading,
  };

  const sidebarCategories: SettingCategory[] = [
    ...categories,
    ...(canAccessBackupSection
      ? [{
          id: BACKUP_SETTINGS_CATEGORY_ID,
          name: "Backup & Restore",
          description: "Create, export, delete, and restore backups from one settings area.",
          settings: [],
        }]
      : []),
    ...(canAccessAccountManagement
      ? [{
          id: ACCOUNT_MANAGEMENT_CATEGORY_ID,
          name: "Account Management",
          description: "Manage user lifecycle, reset requests, and local mail outbox.",
          settings: [],
        }]
      : []),
  ];

  const isAccountManagementCategory = selectedCategory === ACCOUNT_MANAGEMENT_CATEGORY_ID;
  const isBackupCategory = selectedCategory === BACKUP_SETTINGS_CATEGORY_ID;
  const currentCategoryForDisplay = isAccountManagementCategory
    ? sidebarCategories.find((category) => category.id === ACCOUNT_MANAGEMENT_CATEGORY_ID) || null
    : isBackupCategory
      ? sidebarCategories.find((category) => category.id === BACKUP_SETTINGS_CATEGORY_ID) || null
      : currentCategory;

  useEffect(() => {
    if (sidebarCategories.length === 0) return;

    const requestedSection = initialSectionId && sidebarCategories.some((category) => category.id === initialSectionId)
      ? initialSectionId
      : null;
    const selectedStillValid = sidebarCategories.some((category) => category.id === selectedCategory);

    if (requestedSection && selectedCategory !== requestedSection) {
      setSelectedCategory(requestedSection);
      return;
    }

    if (!selectedStillValid) {
      setSelectedCategory(sidebarCategories[0].id);
    }
  }, [initialSectionId, selectedCategory, setSelectedCategory, sidebarCategories]);

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
    categories: sidebarCategories,
    selectedCategory,
    setSelectedCategory,
    currentCategory: currentCategoryForDisplay,
    isRolePermissionCategory,
    isSecurityCategory,
    isAccountManagementCategory,
    isBackupCategory,
    canAccessBackupSection,
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
    accountManagement: accountManagementSection,
    managedDialog,
    managedSecretDialog,
    loadingState: {
      loading,
      profileLoading,
    },
  };
}

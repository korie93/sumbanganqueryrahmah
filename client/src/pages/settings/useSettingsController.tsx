import { useEffect, useMemo, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import type { TabVisibility } from "@/app/types";
import { useSettingsBootstrap } from "@/pages/settings/useSettingsBootstrap";
import { buildSettingsSecurityViewModel } from "@/pages/settings/settings-controller-view-models";
import { useSettingsMyAccount } from "@/pages/settings/useSettingsMyAccount";
import { useSettingsSystemSettings } from "@/pages/settings/useSettingsSystemSettings";
import type { SettingCategory } from "@/pages/settings/types";

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
    handleDisableTwoFactor,
    handleEnableTwoFactor,
    handleChangePassword,
    handleChangeUsername,
    handleStartTwoFactorSetup,
    hydrateCurrentUser,
    newPasswordInput,
    passwordSaving,
    setConfirmPasswordInput,
    setCurrentPasswordInput,
    setNewPasswordInput,
    setTwoFactorCodeInput,
    setTwoFactorPasswordInput,
    setUsernameInput,
    twoFactorCodeInput,
    twoFactorLoading,
    twoFactorPasswordInput,
    twoFactorSetupAccountName,
    twoFactorSetupIssuer,
    twoFactorSetupSecret,
    twoFactorSetupUri,
    usernameInput,
    usernameSaving,
  } = myAccount;
  const canEditSystemSettings =
    currentUser?.role === "admin" || currentUser?.role === "superuser";
  const isSuperuser = currentUser?.role === "superuser";
  const canAccessAccountSecurity =
    currentUser?.role === "superuser" || currentUser?.role === "admin";
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
    maintenanceSettingsSummary,
    persistChanges,
    renderSettingCard,
    roleSections,
    saving,
    selectedCategory,
    setConfirmCriticalOpen,
    setSelectedCategory,
  } = systemSettings;

  const { profileLoading } = useSettingsBootstrap({
    clearSettingsState,
    hydrateCurrentUser,
    isMountedRef,
    loadSettings,
    toast,
  });

  const sidebarCategories: SettingCategory[] = useMemo(
    () => [
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
    ],
    [canAccessAccountManagement, canAccessBackupSection, categories],
  );

  const isAccountManagementCategory = selectedCategory === ACCOUNT_MANAGEMENT_CATEGORY_ID;
  const isBackupCategory = selectedCategory === BACKUP_SETTINGS_CATEGORY_ID;
  const currentCategoryForDisplay = useMemo(
    () => (isAccountManagementCategory
      ? sidebarCategories.find((category) => category.id === ACCOUNT_MANAGEMENT_CATEGORY_ID) || null
      : isBackupCategory
        ? sidebarCategories.find((category) => category.id === BACKUP_SETTINGS_CATEGORY_ID) || null
        : currentCategory),
    [currentCategory, isAccountManagementCategory, isBackupCategory, sidebarCategories],
  );
  const shouldBuildSecurityViewModel = canAccessAccountSecurity && isSecurityCategory;

  const security = useMemo(
    () => {
      if (!shouldBuildSecurityViewModel) {
        return null;
      }

      return buildSettingsSecurityViewModel({
        confirmPasswordInput,
        currentPasswordInput,
        currentUserRole,
        newPasswordInput,
        onDisableTwoFactor: () => void handleDisableTwoFactor(),
        onEnableTwoFactor: () => void handleEnableTwoFactor(),
        onChangePassword: () => void handleChangePassword(),
        onChangeUsername: () => void handleChangeUsername(),
        onConfirmPasswordInputChange: setConfirmPasswordInput,
        onCurrentPasswordInputChange: setCurrentPasswordInput,
        onNewPasswordInputChange: setNewPasswordInput,
        onStartTwoFactorSetup: () => void handleStartTwoFactorSetup(),
        onTwoFactorCodeInputChange: setTwoFactorCodeInput,
        onTwoFactorPasswordInputChange: setTwoFactorPasswordInput,
        onUsernameInputChange: setUsernameInput,
        passwordSaving,
        twoFactorCodeInput,
        twoFactorEnabled: currentUser?.twoFactorEnabled === true,
        twoFactorLoading,
        twoFactorPasswordInput,
        twoFactorPendingSetup: currentUser?.twoFactorPendingSetup === true,
        twoFactorSetupAccountName,
        twoFactorSetupIssuer,
        twoFactorSetupSecret,
        twoFactorSetupUri,
        usernameInput,
        usernameSaving,
      });
    },
    [
      shouldBuildSecurityViewModel,
      confirmPasswordInput,
      currentPasswordInput,
      currentUser?.twoFactorEnabled,
      currentUser?.twoFactorPendingSetup,
      currentUserRole,
      handleChangePassword,
      handleChangeUsername,
      handleDisableTwoFactor,
      handleEnableTwoFactor,
      handleStartTwoFactorSetup,
      newPasswordInput,
      passwordSaving,
      setConfirmPasswordInput,
      setCurrentPasswordInput,
      setNewPasswordInput,
      setTwoFactorCodeInput,
      setTwoFactorPasswordInput,
      setUsernameInput,
      twoFactorCodeInput,
      twoFactorLoading,
      twoFactorPasswordInput,
      twoFactorSetupAccountName,
      twoFactorSetupIssuer,
      twoFactorSetupSecret,
      twoFactorSetupUri,
      usernameInput,
      usernameSaving,
    ],
  );

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
    maintenanceSettingsSummary,
    isAccountManagementCategory,
    isBackupCategory,
    canAccessBackupSection,
    roleSections,
    categoryDirtyMap,
    dirtyCount,
    saving,
    renderSettingCard,
    saveBar: useMemo(
      () => ({
        dirtyCount,
        saving,
        onSave: () => void handleSave(),
      }),
      [dirtyCount, handleSave, saving],
    ),
    criticalSaveDialog: useMemo(
      () => ({
        confirmCriticalOpen,
        onConfirmCriticalOpenChange: setConfirmCriticalOpen,
        onSaveCriticalSettings: async () => {
          await persistChanges(true);
        },
        saving,
      }),
      [confirmCriticalOpen, persistChanges, saving, setConfirmCriticalOpen],
    ),
    security,
    loadingState: {
      loading,
      profileLoading,
    },
  };
}

import { useEffect, useMemo, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import type { TabVisibility } from "@/app/types";
import { useSettingsBootstrap } from "@/pages/settings/useSettingsBootstrap";
import {
  ACCOUNT_MANAGEMENT_CATEGORY_ID,
  BACKUP_SETTINGS_CATEGORY_ID,
  buildSettingsSidebarCategories,
  canAccessBackupCategory,
  findSettingsDisplayCategory,
} from "@/pages/settings/settings-controller-utils";
import { useSettingsMyAccount } from "@/pages/settings/useSettingsMyAccount";
import { useSettingsSecurityViewModel } from "@/pages/settings/useSettingsSecurityViewModel";
import { useSettingsSystemSettings } from "@/pages/settings/useSettingsSystemSettings";
import { useSettingsCategorySelectionSync } from "@/pages/settings/useSettingsCategorySelectionSync";
import type { SettingCategory } from "@/pages/settings/types";

type UseSettingsControllerArgs = {
  initialSectionId?: string;
  tabVisibility?: TabVisibility;
};

export { BACKUP_SETTINGS_CATEGORY_ID } from "@/pages/settings/settings-controller-utils";

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
    () => buildSettingsSidebarCategories({
      canAccessAccountManagement,
      canAccessBackupSection,
      categories,
    }),
    [canAccessAccountManagement, canAccessBackupSection, categories],
  );

  const isAccountManagementCategory = selectedCategory === ACCOUNT_MANAGEMENT_CATEGORY_ID;
  const isBackupCategory = selectedCategory === BACKUP_SETTINGS_CATEGORY_ID;
  const currentCategoryForDisplay = useMemo(
    () => findSettingsDisplayCategory({
      currentCategory,
      isAccountManagementCategory,
      isBackupCategory,
      sidebarCategories,
    }),
    [currentCategory, isAccountManagementCategory, isBackupCategory, sidebarCategories],
  );
  const security = useSettingsSecurityViewModel({
    canAccessAccountSecurity,
    confirmPasswordInput,
    currentPasswordInput,
    currentUserRole,
    handleChangePassword,
    handleChangeUsername,
    handleDisableTwoFactor,
    handleEnableTwoFactor,
    handleStartTwoFactorSetup,
    isSecurityCategory,
    newPasswordInput,
    passwordSaving,
    setConfirmPasswordInput,
    setCurrentPasswordInput,
    setNewPasswordInput,
    setTwoFactorCodeInput,
    setTwoFactorPasswordInput,
    setUsernameInput,
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

  useSettingsCategorySelectionSync({
    initialSectionId,
    selectedCategory,
    setSelectedCategory,
    sidebarCategories,
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

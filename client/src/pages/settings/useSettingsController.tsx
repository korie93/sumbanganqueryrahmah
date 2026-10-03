import { useEffect, useMemo, useRef, useState } from "react";
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
import { useSettingsSystemSettings } from "@/pages/settings/useSettingsSystemSettings";
import { useSettingsCategorySelectionSync } from "@/pages/settings/useSettingsCategorySelectionSync";
import type { CurrentUser, SettingCategory } from "@/pages/settings/types";

type UseSettingsControllerArgs = {
  initialSectionId?: string | undefined;
  tabVisibility?: TabVisibility | undefined;
};

export { BACKUP_SETTINGS_CATEGORY_ID } from "@/pages/settings/settings-controller-utils";

export function useSettingsController({
  initialSectionId,
  tabVisibility,
}: UseSettingsControllerArgs = {}) {
  const { toast } = useToast();
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const [currentUser, hydrateCurrentUser] = useState<CurrentUser | null>(null);
  const canEditSystemSettings =
    currentUser?.role === "admin" || currentUser?.role === "superuser";
  const isSuperuser = currentUser?.role === "superuser";
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
    changeSummary,
    clearSettingsState,
    confirmCriticalOpen,
    currentCategory,
    dirtyCount,
    handleSave,
    isRolePermissionCategory,
    loadSettings,
    loading,
    maintenanceSettingsSummary,
    persistChanges,
    renderSettingCard,
    rolePermissionImpacts,
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

  useSettingsCategorySelectionSync({
    initialSectionId,
    ready: !profileLoading && !loading,
    selectedCategory,
    setSelectedCategory,
    sidebarCategories,
  });

  return {
    currentUser,
    profileLoading,
    canEditSystemSettings,
    isSuperuser,
    currentUserRole,
    categories: sidebarCategories,
    selectedCategory,
    setSelectedCategory,
    currentCategory: currentCategoryForDisplay,
    isRolePermissionCategory,
    maintenanceSettingsSummary,
    isAccountManagementCategory,
    isBackupCategory,
    canAccessBackupSection,
    roleSections,
    categoryDirtyMap,
    dirtyCount,
    saving,
    renderSettingCard,
    rolePermissionImpacts,
    saveBar: useMemo(
      () => ({
        changeSummary,
        dirtyCount,
        saving,
        onSave: () => void handleSave(),
      }),
      [changeSummary, dirtyCount, handleSave, saving],
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
    loadingState: {
      loading,
      profileLoading,
    },
  };
}

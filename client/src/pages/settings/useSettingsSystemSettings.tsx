import { useCallback, useMemo } from "react";
import {
  type UseSettingsSystemSettingsArgs,
} from "@/pages/settings/settings-system-settings-shared";
import { buildSettingsRoleSections } from "@/pages/settings/settings-system-settings-utils";
import { useSettingsCategoryState } from "@/pages/settings/useSettingsCategoryState";
import { useSettingsDraftState } from "@/pages/settings/useSettingsDraftState";

export function useSettingsSystemSettings({
  isMountedRef,
  toast,
}: UseSettingsSystemSettingsArgs) {
  const categoryState = useSettingsCategoryState({
    isMountedRef,
    toast,
  });
  const {
    categories,
    clearSettingsCategoryState,
    loadSettings,
    loading,
    selectedCategory,
    setSelectedCategory,
  } = categoryState;

  const currentCategory = useMemo(
    () => categories.find((category) => category.id === selectedCategory) || null,
    [categories, selectedCategory],
  );
  const isRolePermissionCategory = currentCategory?.name === "Roles & Permissions";
  const isSecurityCategory = currentCategory?.name === "Security";
  const roleSections = useMemo(
    () => buildSettingsRoleSections(currentCategory, isRolePermissionCategory),
    [currentCategory, isRolePermissionCategory],
  );

  const draftState = useSettingsDraftState({
    categories,
    currentCategory,
    isMountedRef,
    loadSettings,
    toast,
  });
  const {
    categoryDirtyMap,
    clearSettingsDraftState,
    confirmCriticalOpen,
    dirtyCount,
    handleSave,
    maintenanceSettingsSummary,
    persistChanges,
    renderSettingCard,
    saving,
    setConfirmCriticalOpen,
  } = draftState;

  const clearSettingsState = useCallback(() => {
    clearSettingsCategoryState();
    clearSettingsDraftState();
  }, [clearSettingsCategoryState, clearSettingsDraftState]);

  return {
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
  };
}

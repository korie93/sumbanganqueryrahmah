import { useCallback, useMemo, useState, type MutableRefObject } from "react";
import { getSettings, updateSetting } from "@/lib/api";
import { SettingCard } from "@/pages/settings/SettingCard";
import type { SettingCategory, SettingItem } from "@/pages/settings/types";
import {
  getRoleSettingOrder,
  normalizeSettingsErrorPayload,
  settingsCategoryOrder,
} from "@/pages/settings/utils";

type ToastFn = (payload: {
  title: string;
  description: string;
  variant?: "default" | "destructive";
}) => void;

type UseSettingsSystemSettingsArgs = {
  isMountedRef: MutableRefObject<boolean>;
  toast: ToastFn;
};

export function useSettingsSystemSettings({
  isMountedRef,
  toast,
}: UseSettingsSystemSettingsArgs) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<SettingCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [draftValues, setDraftValues] = useState<
    Record<string, string | number | boolean | null>
  >({});
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());
  const [confirmCriticalOpen, setConfirmCriticalOpen] = useState(false);

  const settingMap = useMemo(() => {
    const map = new Map<string, SettingItem>();
    for (const category of categories) {
      for (const setting of category.settings) {
        map.set(setting.key, setting);
      }
    }
    return map;
  }, [categories]);

  const currentCategory = useMemo(
    () => categories.find((category) => category.id === selectedCategory) || null,
    [categories, selectedCategory],
  );

  const dirtyCount = dirtyKeys.size;
  const dirtyCriticalCount = useMemo(
    () =>
      Array.from(dirtyKeys).filter((key) => settingMap.get(key)?.isCritical).length,
    [dirtyKeys, settingMap],
  );
  const isRolePermissionCategory = currentCategory?.name === "Roles & Permissions";
  const isSecurityCategory = currentCategory?.name === "Security";

  const categoryDirtyMap = useMemo(() => {
    const next = new Map<string, number>();
    if (dirtyKeys.size === 0) return next;

    for (const category of categories) {
      let count = 0;
      for (const setting of category.settings) {
        if (dirtyKeys.has(setting.key)) count += 1;
      }
      if (count > 0) next.set(category.id, count);
    }

    return next;
  }, [categories, dirtyKeys]);

  const roleSections = useMemo(() => {
    if (!isRolePermissionCategory || !currentCategory) return null;

    const isObsoleteAiToggle = (setting: SettingItem) =>
      setting.key === "tab_admin_ai_enabled" || setting.key === "tab_user_ai_enabled";

    const admin = currentCategory.settings
      .filter(
        (setting) =>
          setting.key.startsWith("tab_admin_") ||
          setting.key === "canViewSystemPerformance",
      )
      .filter((setting) => !isObsoleteAiToggle(setting))
      .sort(
        (left, right) =>
          getRoleSettingOrder(left.key) - getRoleSettingOrder(right.key) ||
          left.label.localeCompare(right.label),
      );

    const user = currentCategory.settings
      .filter((setting) => setting.key.startsWith("tab_user_"))
      .filter((setting) => !isObsoleteAiToggle(setting))
      .sort(
        (left, right) =>
          getRoleSettingOrder(left.key) - getRoleSettingOrder(right.key) ||
          left.label.localeCompare(right.label),
      );

    const other = currentCategory.settings
      .filter(
        (setting) =>
          !setting.key.startsWith("tab_admin_") &&
          !setting.key.startsWith("tab_user_") &&
          setting.key !== "canViewSystemPerformance",
      )
      .sort((left, right) => left.label.localeCompare(right.label));

    return { admin, user, other };
  }, [currentCategory, isRolePermissionCategory]);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getSettings();
      if (!isMountedRef.current) return;

      const rawCategories = Array.isArray(response?.categories)
        ? response.categories
        : [];
      const sorted = [...rawCategories].sort(
        (left: SettingCategory, right: SettingCategory) => {
          const leftIndex = settingsCategoryOrder.indexOf(left.name);
          const rightIndex = settingsCategoryOrder.indexOf(right.name);
          if (leftIndex === -1 && rightIndex === -1) {
            return left.name.localeCompare(right.name);
          }
          if (leftIndex === -1) return 1;
          if (rightIndex === -1) return -1;
          return leftIndex - rightIndex;
        },
      );

      setCategories(sorted);
      setSelectedCategory((previous) => {
        if (!previous && sorted.length > 0) return sorted[0].id;
        if (previous && !sorted.some((category) => category.id === previous)) {
          return sorted[0]?.id || "";
        }
        return previous;
      });
    } catch (error: unknown) {
      if (!isMountedRef.current) return;
      const parsed = normalizeSettingsErrorPayload(error);
      toast({
        title: "Failed to Load Settings",
        description: parsed.message,
        variant: "destructive",
      });
    } finally {
      if (!isMountedRef.current) return;
      setLoading(false);
    }
  }, [isMountedRef, toast]);

  const clearSettingsState = useCallback(() => {
    setLoading(false);
    setSaving(false);
    setCategories([]);
    setSelectedCategory("");
    setDraftValues({});
    setDirtyKeys(new Set());
    setConfirmCriticalOpen(false);
  }, []);

  const getEffectiveValue = useCallback(
    (setting: SettingItem) =>
      Object.prototype.hasOwnProperty.call(draftValues, setting.key)
        ? draftValues[setting.key]
        : setting.value,
    [draftValues],
  );

  const markDirty = useCallback(
    (key: string, value: string | number | boolean | null) => {
      const originalValue = settingMap.get(key)?.value ?? null;
      const sameAsOriginal = String(value ?? "") === String(originalValue ?? "");

      setDraftValues((previous) => {
        if (sameAsOriginal) {
          if (!Object.prototype.hasOwnProperty.call(previous, key)) return previous;
          const { [key]: _removed, ...rest } = previous;
          return rest;
        }

        const currentValue = Object.prototype.hasOwnProperty.call(previous, key)
          ? previous[key]
          : originalValue;
        if (String(currentValue ?? "") === String(value ?? "")) return previous;
        return { ...previous, [key]: value };
      });

      setDirtyKeys((previous) => {
        const hasKey = previous.has(key);
        if (sameAsOriginal && !hasKey) return previous;
        if (!sameAsOriginal && hasKey) return previous;
        const next = new Set(previous);
        if (sameAsOriginal) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    [settingMap],
  );

  const persistChanges = useCallback(
    async (confirmCritical: boolean) => {
      if (dirtyKeys.size === 0) return;

      setSaving(true);
      try {
        const keys = Array.from(dirtyKeys);
        for (const key of keys) {
          const payloadValue = Object.prototype.hasOwnProperty.call(draftValues, key)
            ? draftValues[key]
            : settingMap.get(key)?.value ?? null;

          try {
            await updateSetting({
              key,
              value: payloadValue ?? null,
              confirmCritical,
            });
          } catch (error: unknown) {
            const parsed = normalizeSettingsErrorPayload(error);
            if (parsed.requiresConfirmation && !confirmCritical) {
              if (isMountedRef.current) setConfirmCriticalOpen(true);
              return;
            }

            toast({
              title: `Failed to Save: ${key}`,
              description: parsed.message,
              variant: "destructive",
            });
            return;
          }
        }

        toast({
          title: "Settings Updated",
          description: `${keys.length} setting(s) saved successfully.`,
        });

        window.dispatchEvent(
          new CustomEvent("settings-updated", {
            detail: { source: "settings-page" },
          }),
        );
        if (!isMountedRef.current) return;
        setDirtyKeys(new Set());
        setDraftValues({});
        await loadSettings();
      } finally {
        if (!isMountedRef.current) return;
        setSaving(false);
      }
    },
    [dirtyKeys, draftValues, isMountedRef, loadSettings, settingMap, toast],
  );

  const handleSave = useCallback(async () => {
    if (dirtyCount === 0 || saving) return;
    if (dirtyCriticalCount > 0) {
      setConfirmCriticalOpen(true);
      return;
    }
    await persistChanges(false);
  }, [dirtyCount, dirtyCriticalCount, persistChanges, saving]);

  const renderSettingCard = useCallback(
    (setting: SettingItem) => (
      <SettingCard
        key={setting.key}
        setting={setting}
        value={getEffectiveValue(setting)}
        isDirty={dirtyKeys.has(setting.key)}
        saving={saving}
        onChange={markDirty}
      />
    ),
    [dirtyKeys, getEffectiveValue, markDirty, saving],
  );

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
    persistChanges,
    renderSettingCard,
    roleSections,
    saving,
    selectedCategory,
    setConfirmCriticalOpen,
    setSelectedCategory,
  };
}

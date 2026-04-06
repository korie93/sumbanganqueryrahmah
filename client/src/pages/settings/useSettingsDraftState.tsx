import { useCallback, useMemo, useState } from "react";
import { updateSetting } from "@/lib/api";
import { buildMaintenanceSettingsSummary } from "@/pages/settings/maintenance-settings-summary";
import { SettingCard } from "@/pages/settings/SettingCard";
import {
  type UseSettingsSystemSettingsArgs,
} from "@/pages/settings/settings-system-settings-shared";
import {
  buildCategoryDirtyMap,
  buildSettingMap,
} from "@/pages/settings/settings-system-settings-utils";
import type { SettingCategory, SettingItem } from "@/pages/settings/types";
import { normalizeSettingsErrorPayload } from "@/pages/settings/utils";

type UseSettingsDraftStateArgs = UseSettingsSystemSettingsArgs & {
  categories: SettingCategory[];
  currentCategory: SettingCategory | null;
  loadSettings: () => Promise<void>;
};

export function useSettingsDraftState({
  categories,
  currentCategory,
  isMountedRef,
  loadSettings,
  toast,
}: UseSettingsDraftStateArgs) {
  const [saving, setSaving] = useState(false);
  const [draftValues, setDraftValues] = useState<
    Record<string, string | number | boolean | null>
  >({});
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());
  const [confirmCriticalOpen, setConfirmCriticalOpen] = useState(false);

  const settingMap = useMemo(() => buildSettingMap(categories), [categories]);
  const dirtyCount = dirtyKeys.size;
  const dirtyCriticalCount = useMemo(
    () =>
      Array.from(dirtyKeys).filter((key) => settingMap.get(key)?.isCritical).length,
    [dirtyKeys, settingMap],
  );

  const categoryDirtyMap = useMemo(
    () => buildCategoryDirtyMap(categories, dirtyKeys),
    [categories, dirtyKeys],
  );

  const clearSettingsDraftState = useCallback(() => {
    setSaving(false);
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

  const maintenanceSettingsSummary = useMemo(
    () => buildMaintenanceSettingsSummary(currentCategory, (key) => {
      const setting = settingMap.get(key);
      if (!setting) return null;
      return getEffectiveValue(setting);
    }),
    [currentCategory, getEffectiveValue, settingMap],
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
              if (isMountedRef.current) {
                setConfirmCriticalOpen(true);
              }
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
  };
}

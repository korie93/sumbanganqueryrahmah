import { useCallback, useState } from "react";
import { getSettings } from "@/lib/api";
import {
  type UseSettingsSystemSettingsArgs,
} from "@/pages/settings/settings-system-settings-shared";
import { sortSettingsCategories } from "@/pages/settings/settings-system-settings-utils";
import type { SettingCategory } from "@/pages/settings/types";
import { normalizeSettingsErrorPayload } from "@/pages/settings/utils";

export function useSettingsCategoryState({
  isMountedRef,
  toast,
}: UseSettingsSystemSettingsArgs) {
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<SettingCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getSettings();
      if (!isMountedRef.current) return;

      const rawCategories = Array.isArray(response?.categories)
        ? response.categories
        : [];
      const sorted = sortSettingsCategories(rawCategories);

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

  const clearSettingsCategoryState = useCallback(() => {
    setLoading(false);
    setCategories([]);
    setSelectedCategory("");
  }, []);

  return {
    categories,
    clearSettingsCategoryState,
    loadSettings,
    loading,
    selectedCategory,
    setSelectedCategory,
  };
}

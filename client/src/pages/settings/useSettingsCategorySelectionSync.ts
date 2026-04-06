import { useEffect } from "react";
import { resolveNextSelectedSettingsCategory } from "@/pages/settings/settings-controller-utils";
import type { SettingCategory } from "@/pages/settings/types";

type UseSettingsCategorySelectionSyncArgs = {
  initialSectionId?: string;
  selectedCategory: string;
  setSelectedCategory: (value: string) => void;
  sidebarCategories: SettingCategory[];
};

export function useSettingsCategorySelectionSync({
  initialSectionId,
  selectedCategory,
  setSelectedCategory,
  sidebarCategories,
}: UseSettingsCategorySelectionSyncArgs) {
  useEffect(() => {
    const nextCategory = resolveNextSelectedSettingsCategory({
      initialSectionId,
      selectedCategory,
      sidebarCategories,
    });
    if (nextCategory) {
      setSelectedCategory(nextCategory);
    }
  }, [initialSectionId, selectedCategory, setSelectedCategory, sidebarCategories]);
}

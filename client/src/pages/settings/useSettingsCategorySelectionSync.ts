import { useEffect, useRef } from "react";
import { createSettingsCategorySelectionResolver } from "@/pages/settings/settings-controller-utils";
import type { SettingCategory } from "@/pages/settings/types";

type UseSettingsCategorySelectionSyncArgs = {
  initialSectionId?: string | undefined;
  ready: boolean;
  selectedCategory: string;
  setSelectedCategory: (value: string) => void;
  sidebarCategories: SettingCategory[];
};

export function useSettingsCategorySelectionSync({
  initialSectionId,
  ready,
  selectedCategory,
  setSelectedCategory,
  sidebarCategories,
}: UseSettingsCategorySelectionSyncArgs) {
  const selectionResolverRef = useRef<ReturnType<typeof createSettingsCategorySelectionResolver> | null>(null);
  useEffect(() => {
    selectionResolverRef.current ??= createSettingsCategorySelectionResolver();
    const nextCategory = selectionResolverRef.current({
      initialSectionId,
      ready,
      selectedCategory,
      sidebarCategories,
    });
    if (nextCategory) {
      setSelectedCategory(nextCategory);
    }
  }, [initialSectionId, ready, selectedCategory, setSelectedCategory, sidebarCategories]);
}

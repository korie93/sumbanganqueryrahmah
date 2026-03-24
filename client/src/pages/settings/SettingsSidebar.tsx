import { useMemo } from "react";
import { LazySideTabNavigation } from "@/components/navigation/LazySideTabNavigation";
import { getSettingsCategoryIcon } from "@/pages/settings/settings-sidebar-icons";
import type { SettingCategory } from "@/pages/settings/types";

interface SettingsSidebarProps {
  categories: SettingCategory[];
  categoryDirtyMap: Map<string, number>;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
  onSelectCategory: (categoryId: string) => void;
  onSidebarCollapsedChange: (value: boolean) => void;
  selectedCategory: string;
  sidebarCollapsed: boolean;
}

export function SettingsSidebar({
  categories,
  categoryDirtyMap,
  mobileOpen,
  onMobileOpenChange,
  onSelectCategory,
  onSidebarCollapsedChange,
  selectedCategory,
  sidebarCollapsed,
}: SettingsSidebarProps) {
  const items = useMemo(
    () =>
      categories.map((category) => ({
        key: category.id,
        label: category.name,
        icon: getSettingsCategoryIcon(category),
        description: category.description,
        badge: categoryDirtyMap.get(category.id) || null,
      })),
    [categories, categoryDirtyMap],
  );

  return (
    <LazySideTabNavigation
      items={items}
      selectedKey={selectedCategory}
      onSelect={onSelectCategory}
      mobileOpen={mobileOpen}
      onMobileOpenChange={onMobileOpenChange}
      collapsed={sidebarCollapsed}
      onCollapsedChange={onSidebarCollapsedChange}
      menuLabel="Settings Menu"
      navigationLabel="Settings Navigation"
      expandedWidth={296}
      collapsedWidth={88}
      className="border-border/60 bg-background/75"
    />
  );
}

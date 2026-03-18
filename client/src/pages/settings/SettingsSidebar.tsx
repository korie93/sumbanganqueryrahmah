import { DatabaseBackup, KeyRound, ShieldCheck, SlidersHorizontal, UserCog } from "lucide-react";
import { SideTabNavigation } from "@/components/navigation/SideTabNavigation";
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

function getSettingsCategoryIcon(category: SettingCategory) {
  if (category.id === "backup-restore") {
    return DatabaseBackup;
  }
  if (category.id === "account-management") {
    return UserCog;
  }
  if (category.id.includes("security")) {
    return ShieldCheck;
  }
  if (category.id.includes("role") || category.id.includes("permission")) {
    return KeyRound;
  }
  return SlidersHorizontal;
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
  const items = categories.map((category) => ({
    key: category.id,
    label: category.name,
    icon: getSettingsCategoryIcon(category),
    description: category.description,
    badge: categoryDirtyMap.get(category.id) || null,
  }));

  return (
    <SideTabNavigation
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

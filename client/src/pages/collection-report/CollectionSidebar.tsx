import { LazySideTabNavigation } from "@/components/navigation/LazySideTabNavigation";
import type { CollectionSidebarItem, CollectionSubPage } from "@/pages/collection-report/types";

export interface CollectionSidebarProps {
  items: CollectionSidebarItem[];
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
  onSelectSubPage: (subPage: CollectionSubPage) => void;
  selectedSubPage: CollectionSubPage;
  sidebarCollapsed: boolean;
  onSidebarCollapsedChange: (value: boolean) => void;
}

export function CollectionSidebar({
  items,
  mobileOpen,
  onMobileOpenChange,
  onSelectSubPage,
  selectedSubPage,
  sidebarCollapsed,
  onSidebarCollapsedChange,
}: CollectionSidebarProps) {
  return (
    <LazySideTabNavigation
      items={items}
      selectedKey={selectedSubPage}
      onSelect={(key) => onSelectSubPage(key as CollectionSubPage)}
      mobileOpen={mobileOpen}
      onMobileOpenChange={onMobileOpenChange}
      collapsed={sidebarCollapsed}
      onCollapsedChange={onSidebarCollapsedChange}
      menuLabel="Menu"
      navigationLabel="Collection Navigation"
    />
  );
}

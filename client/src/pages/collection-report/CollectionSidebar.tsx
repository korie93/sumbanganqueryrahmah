import { SideTabNavigation } from "@/components/navigation/SideTabNavigation";
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
    <SideTabNavigation
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

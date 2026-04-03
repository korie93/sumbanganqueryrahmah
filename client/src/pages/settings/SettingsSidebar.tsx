import { useMemo } from "react";
import { Menu } from "lucide-react";
import { LazySideTabNavigation } from "@/components/navigation/LazySideTabNavigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
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
  const isMobile = useIsMobile();
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
  const selectedItem = items.find((item) => item.key === selectedCategory) ?? items[0] ?? null;

  return (
    <>
      {isMobile ? (
        <div className="space-y-3 lg:hidden">
          <div className="rounded-[28px] border border-border/60 bg-background/80 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-[11px] font-semibold tracking-[0.22em] text-primary/80 uppercase">
                  Settings Sections
                </p>
                <p className="truncate text-sm font-semibold text-foreground">
                  {selectedItem?.label || "Choose a section"}
                </p>
                {selectedItem?.description ? (
                  <p className="text-xs leading-5 text-muted-foreground">
                    {selectedItem.description}
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 rounded-full"
                onClick={() => onMobileOpenChange(true)}
              >
                <Menu className="h-4 w-4" />
                Browse
              </Button>
            </div>

            <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
              {items.map((item) => {
                const Icon = item.icon;
                const active = item.key === selectedCategory;
                const showBadge = item.badge !== null && item.badge !== undefined;

                return (
                  <button
                    key={`settings-mobile-strip-${item.key}`}
                    type="button"
                    onClick={() => onSelectCategory(item.key)}
                    className={cn(
                      "flex min-w-fit items-center gap-2 rounded-full border px-3 py-2 text-left text-xs transition-colors",
                      active
                        ? "border-primary/35 bg-primary/10 text-primary"
                        : "border-border/60 bg-background/80 text-muted-foreground hover:border-primary/20 hover:text-foreground",
                    )}
                  >
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-background/80">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="max-w-[9rem] truncate font-medium">{item.label}</span>
                    {showBadge ? (
                      <Badge
                        variant={active ? "default" : "secondary"}
                        className="rounded-full px-2 py-0 text-[10px]"
                      >
                        {item.badge}
                      </Badge>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      <LazySideTabNavigation
        items={items}
        selectedKey={selectedCategory}
        onSelect={onSelectCategory}
        mobileOpen={mobileOpen}
        onMobileOpenChange={onMobileOpenChange}
        hideMobileTrigger={isMobile}
        collapsed={sidebarCollapsed}
        onCollapsedChange={onSidebarCollapsedChange}
        menuLabel="Settings Menu"
        navigationLabel="Settings Navigation"
        expandedWidth={296}
        collapsedWidth={88}
        className="border-border/60 bg-background/75"
      />
    </>
  );
}

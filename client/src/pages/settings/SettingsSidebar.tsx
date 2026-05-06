import { useMemo } from "react";
import { Menu } from "lucide-react";
import { LazySideTabNavigation } from "@/components/navigation/LazySideTabNavigation";
import { HorizontalScrollHint } from "@/components/HorizontalScrollHint";
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
  const shouldRenderNavigation = !isMobile || mobileOpen;
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
          <div className="rounded-[2rem] border border-border/60 bg-background/92 p-4 shadow-[0_20px_36px_-30px_hsl(222_47%_11%_/_0.18)] dark:border-white/10 dark:bg-[hsl(224_38%_12%_/_0.96)] dark:shadow-[0_20px_36px_-28px_hsl(222_72%_5%_/_0.72)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-foreground/64 dark:text-foreground/76">
                  Settings Sections
                </p>
                <p className="truncate text-base font-semibold text-foreground">
                  {selectedItem?.label || "Choose a section"}
                </p>
                {selectedItem?.description ? (
                  <p className="text-xs leading-5 text-foreground/62 dark:text-foreground/74">
                    {selectedItem.description}
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 rounded-full dark:border-white/10 dark:bg-white/[0.03] dark:text-foreground/88 dark:hover:bg-white/[0.06] dark:hover:text-foreground"
                onClick={() => onMobileOpenChange(true)}
              >
                <Menu className="h-4 w-4" />
                Browse
              </Button>
            </div>

            <HorizontalScrollHint
              className="mt-3"
              viewportClassName="-mx-1 flex gap-2 px-1 pb-1"
              hint="Swipe sections"
            >
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
                      "flex min-h-10 min-w-fit items-center gap-2 rounded-full border px-3.5 py-2 text-left text-[13px] font-semibold transition-colors",
                      active
                        ? "border-primary bg-primary text-primary-foreground shadow-sm dark:border-primary dark:bg-primary dark:text-primary-foreground"
                        : "border-border/60 bg-background/80 text-foreground/78 hover:border-primary/20 hover:text-foreground dark:border-white/10 dark:bg-white/[0.03] dark:text-foreground/88 dark:hover:bg-white/[0.06] dark:hover:text-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                        active
                          ? "bg-primary-foreground text-primary"
                          : "bg-background/80 text-foreground dark:bg-white/[0.06] dark:text-foreground/88",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="max-w-[9rem] truncate leading-tight">{item.label}</span>
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
            </HorizontalScrollHint>
          </div>
        </div>
      ) : null}

      {shouldRenderNavigation ? (
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
          className="border-border/60 bg-background/92"
        />
      ) : null}
    </>
  );
}

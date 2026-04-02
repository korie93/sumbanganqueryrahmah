import { ChevronRight, Compass, LayoutGrid, Menu } from "lucide-react";
import { useMemo } from "react";
import { LazySideTabNavigation } from "@/components/navigation/LazySideTabNavigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
  const selectedItem = useMemo(
    () => items.find((item) => item.key === selectedSubPage) || items[0],
    [items, selectedSubPage],
  );
  const quickItems = useMemo(() => items.slice(0, Math.min(items.length, 4)), [items]);

  return (
    <>
      <section
        className="rounded-[1.75rem] border border-border/70 bg-background/92 p-4 shadow-sm lg:hidden"
        data-testid="collection-mobile-launcher"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Collection Sections
            </p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">
              {selectedItem?.label || "Collection"}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Jump between collection tasks quickly without opening the desktop-style side navigation first.
            </p>
          </div>
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
            <Compass className="h-5 w-5" />
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {quickItems.map((item) => {
            const Icon = item.icon;
            const active = item.key === selectedSubPage;
            return (
              <button
                key={`collection-mobile-${item.key}`}
                type="button"
                onClick={() => onSelectSubPage(item.key)}
                className={cn(
                  "flex min-h-[5.25rem] flex-col items-start gap-2 rounded-2xl border px-3 py-3 text-left transition-colors",
                  active
                    ? "border-primary/35 bg-primary/10 text-primary"
                    : "border-border/60 bg-muted/25 text-foreground hover:border-primary/20 hover:bg-accent/35",
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-9 w-9 items-center justify-center rounded-xl",
                    active ? "bg-primary/15" : "bg-background/85 text-primary",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-sm font-semibold leading-tight">{item.label}</span>
              </button>
            );
          })}
        </div>

        <Button
          type="button"
          variant="outline"
          className="mt-3 h-11 w-full justify-between rounded-2xl"
          onClick={() => onMobileOpenChange(true)}
          data-testid="button-open-collection-sections"
        >
          <span className="inline-flex items-center gap-2">
            <LayoutGrid className="h-4 w-4" />
            All Collection Sections
          </span>
          <span className="inline-flex items-center gap-2 text-muted-foreground">
            <Menu className="h-4 w-4" />
            <ChevronRight className="h-4 w-4" />
          </span>
        </Button>
      </section>

      <LazySideTabNavigation
        items={items}
        selectedKey={selectedSubPage}
        onSelect={(key) => onSelectSubPage(key as CollectionSubPage)}
        mobileOpen={mobileOpen}
        onMobileOpenChange={onMobileOpenChange}
        hideMobileTrigger
        collapsed={sidebarCollapsed}
        onCollapsedChange={onSidebarCollapsedChange}
        menuLabel="Menu"
        navigationLabel="Collection Navigation"
      />
    </>
  );
}

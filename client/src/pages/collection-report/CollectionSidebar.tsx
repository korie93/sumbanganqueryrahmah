import { ChevronRight, Compass, LayoutGrid, Menu } from "lucide-react";
import { useMemo } from "react";
import { LazySideTabNavigation } from "@/components/navigation/LazySideTabNavigation";
import { Badge } from "@/components/ui/badge";
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

  return (
    <>
      <section
        className="rounded-[1.5rem] border border-border/70 bg-background/92 p-3 shadow-sm lg:hidden"
        data-testid="collection-mobile-launcher"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Collection Section
            </p>
            <div className="mt-1 flex items-center gap-2">
              <h2 className="truncate text-base font-semibold text-foreground">
                {selectedItem?.label || "Collection"}
              </h2>
              <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-[10px]">
                Active
              </Badge>
            </div>
          </div>
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
            <Compass className="h-5 w-5" />
          </span>
        </div>

        <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
          {items.map((item) => {
            const Icon = item.icon;
            const active = item.key === selectedSubPage;
            return (
              <button
                key={`collection-mobile-${item.key}`}
                type="button"
                onClick={() => onSelectSubPage(item.key)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-left text-sm font-medium transition-colors",
                  active
                    ? "border-primary/35 bg-primary/10 text-primary"
                    : "border-border/60 bg-muted/25 text-foreground hover:border-primary/20 hover:bg-accent/35",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="whitespace-nowrap leading-tight">{item.label}</span>
              </button>
            );
          })}
        </div>

        <Button
          type="button"
          variant="ghost"
          className="mt-2 h-10 w-full justify-between rounded-xl border border-dashed border-border/60 text-muted-foreground"
          onClick={() => onMobileOpenChange(true)}
          data-testid="button-open-collection-sections"
        >
          <span className="inline-flex items-center gap-2">
            <LayoutGrid className="h-4 w-4" />
            Browse Sections
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

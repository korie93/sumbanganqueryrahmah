import { ChevronRight, Compass, LayoutGrid, Menu } from "lucide-react";
import { useMemo } from "react";
import { HorizontalScrollHint } from "@/components/HorizontalScrollHint";
import { LazySideTabNavigation } from "@/components/navigation/LazySideTabNavigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
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
  const isMobile = useIsMobile();
  const shouldRenderNavigation = !isMobile || mobileOpen;
  const selectedItem = useMemo(
    () => items.find((item) => item.key === selectedSubPage) || items[0],
    [items, selectedSubPage],
  );

  return (
    <>
      <section
        className="rounded-[1.5rem] border border-border/70 bg-background p-3 shadow-sm dark:border-border/70 dark:bg-card dark:shadow-[0_20px_36px_-28px_hsl(0_0%_0%_/_0.72)] lg:hidden"
        data-testid="collection-mobile-launcher"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-2xs font-semibold uppercase tracking-label-lg text-foreground/62 dark:text-foreground/72">
              Collection Section
            </p>
            <div className="mt-1 flex items-center gap-2">
              <h2 className="truncate text-base font-semibold text-foreground">
                {selectedItem?.label || "Collection"}
              </h2>
              <Badge className="rounded-full px-2 py-0.5 text-xxs shadow-sm">
                Active
              </Badge>
            </div>
          </div>
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary dark:border-primary/25 dark:bg-primary/14 dark:text-primary-foreground/92">
            <Compass className="h-5 w-5" />
          </span>
        </div>

        <HorizontalScrollHint
          className="mt-3"
          viewportClassName="-mx-1 flex gap-2 px-1 pb-1"
          hint="Swipe sections"
        >
          {items.map((item) => {
            const Icon = item.icon;
            const active = item.key === selectedSubPage;
            return (
              <button
                key={`collection-mobile-${item.key}`}
                type="button"
                onClick={() => onSelectSubPage(item.key)}
                data-active={active ? "true" : "false"}
                className={cn(
                  "side-tab-nav-item inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-left text-nav-sm font-semibold transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground shadow-sm dark:border-primary dark:bg-primary dark:text-primary-foreground"
                    : "border-border/60 bg-muted/25 text-foreground/88 hover:border-primary/20 hover:bg-accent/45 hover:text-foreground dark:border-border/70 dark:bg-card dark:text-foreground/92 dark:hover:bg-accent",
                )}
              >
                <span
                  className={cn(
                    "side-tab-nav-icon inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                    active
                      ? "bg-primary-foreground text-primary"
                      : "bg-background/80 text-foreground dark:bg-card dark:text-foreground/88",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                </span>
                <span className="whitespace-nowrap leading-tight">{item.label}</span>
              </button>
            );
          })}
        </HorizontalScrollHint>

        <Button
          type="button"
          variant="ghost"
          className="mt-2 h-10 w-full justify-between rounded-xl border border-dashed border-border/60 text-foreground/76 hover:text-foreground dark:border-border/70 dark:bg-card dark:text-foreground/82 dark:hover:bg-accent dark:hover:text-foreground"
          onClick={() => onMobileOpenChange(true)}
          data-testid="button-open-collection-sections"
        >
          <span className="inline-flex items-center gap-2">
            <LayoutGrid className="h-4 w-4" />
            Browse Sections
          </span>
          <span className="inline-flex items-center gap-2 text-foreground/56 dark:text-foreground/68">
            <Menu className="h-4 w-4" />
            <ChevronRight className="h-4 w-4" />
          </span>
        </Button>
      </section>

      {shouldRenderNavigation ? (
        <LazySideTabNavigation
          items={items}
          selectedKey={selectedSubPage}
          onSelect={(key) => onSelectSubPage(key as CollectionSubPage)}
          mobileOpen={mobileOpen}
          onMobileOpenChange={onMobileOpenChange}
          hideMobileTrigger
          collapsed={sidebarCollapsed}
          onCollapsedChange={onSidebarCollapsedChange}
          menuLabel="Browse sections"
          navigationLabel="Collection sections"
          expandedWidth={308}
          collapsedWidth={88}
          fallbackClassName="w-[19.25rem]"
        />
      ) : null}
    </>
  );
}

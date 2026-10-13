import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { getAriaCurrentPageProps } from "@/lib/aria-state-props";
import { cn } from "@/lib/utils";
import { LARGE_UP_MEDIA_QUERY } from "@/lib/responsive";
import type { CollectionSidebarItem, CollectionSubPage } from "@/pages/collection-report/types";
import { getCollectionSectionShortLabel } from "./collection-section-labels";

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
}: CollectionSidebarProps) {
  const isMobile = useIsMobile();
  const launcherRef = useRef<HTMLButtonElement>(null);
  const desktopNavRef = useRef<HTMLElement>(null);
  const selectedItem = useMemo(
    () => items.find((item) => item.key === selectedSubPage) || items[0],
    [items, selectedSubPage],
  );

  useEffect(() => {
    const nav = desktopNavRef.current;
    if (!nav || isMobile) return;
    // Scroll the strip, never the page. Native Tab focus also reveals overflowed buttons.
    const revealCurrent = () => {
      if (!window.matchMedia(LARGE_UP_MEDIA_QUERY).matches) return;
      const active = nav.querySelector<HTMLButtonElement>('[data-active="true"]');
      if (!active) return;
      const container = nav.getBoundingClientRect(), button = active.getBoundingClientRect();
      if (button.left < container.left) nav.scrollLeft += button.left - container.left;
      else if (button.right > container.right) nav.scrollLeft += button.right - container.right;
    };
    revealCurrent();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(revealCurrent) : null;
    observer?.observe(nav);
    return () => observer?.disconnect();
  }, [isMobile, items, selectedSubPage]);

  if (!isMobile) {
    return (
      <nav ref={desktopNavRef} aria-label="Collection sections" className="collection-section-nav flex flex-wrap gap-1 border-b border-border pb-3">
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.key === selectedSubPage;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onSelectSubPage(item.key)}
              aria-label={item.label}
              title={item.label}
              {...getAriaCurrentPageProps(active)}
              data-active={active ? "true" : "false"}
              className={cn(
                "collection-section-link inline-flex min-h-9 items-center gap-2 rounded-md border px-3 py-2 text-left text-xs font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="collection-section-label-full">{item.label}</span>
              <span className="collection-section-label-short" aria-hidden="true">{getCollectionSectionShortLabel(item.key, item.label)}</span>
            </button>
          );
        })}
      </nav>
    );
  }

  return (
    <>
      <div data-testid="collection-mobile-launcher">
        <Button
          ref={launcherRef}
          type="button"
          variant="outline"
          className="min-h-11 w-full justify-between rounded-md"
          onClick={() => onMobileOpenChange(true)}
          data-testid="button-open-collection-sections"
          aria-label={`Browse Sections: ${selectedItem?.label || "Collection"}`}
          aria-haspopup="dialog"
        >
          <span className="min-w-0 truncate">{selectedItem?.label || "Browse Sections"}</span>
          <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
        </Button>
      </div>
      <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent
          side="left"
          className="w-[min(92vw,22rem)]"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            launcherRef.current?.focus({ preventScroll: true });
          }}
        >
          <SheetHeader className="pr-8 text-left">
            <SheetTitle>Collection sections</SheetTitle>
            <SheetDescription>Choose a section in the Collection workspace.</SheetDescription>
          </SheetHeader>
          <nav className="mt-4 space-y-1" aria-label="Collection sections mobile">
            {items.map((item) => {
              const Icon = item.icon;
              const active = item.key === selectedSubPage;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    onSelectSubPage(item.key);
                    onMobileOpenChange(false);
                  }}
                  {...getAriaCurrentPageProps(active)}
                  className={cn(
                    "flex min-h-11 w-full items-start gap-3 rounded-md px-3 py-3 text-left text-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent",
                  )}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block font-medium">{item.label}</span>
                    {item.description ? <span className="mt-1 block text-xs text-muted-foreground">{item.description}</span> : null}
                  </span>
                </button>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}

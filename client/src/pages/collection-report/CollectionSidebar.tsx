import { useCallback, useEffect, useRef } from "react";
import { getAriaCurrentPageProps } from "@/lib/aria-state-props";
import { cn } from "@/lib/utils";
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
  onSelectSubPage,
  selectedSubPage,
}: CollectionSidebarProps) {
  const navRef = useRef<HTMLElement>(null);
  const revealSection = useCallback((button: HTMLButtonElement) => {
    const nav = navRef.current;
    if (!nav) return;
    const container = nav.getBoundingClientRect(), bounds = button.getBoundingClientRect();
    // Keep the complete button and its focus ring inside the scroll viewport.
    if (bounds.left < container.left + 4) nav.scrollLeft += bounds.left - container.left - 4;
    else if (bounds.right > container.right - 4) nav.scrollLeft += bounds.right - container.right + 4;
  }, []);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    // Reveal only the strip, never scroll the form/page. Preserve keyboard focus
    // when a font/container resize occurs instead of returning to the active tab.
    const revealCurrent = () => {
      const active = nav.querySelector<HTMLButtonElement>(':focus')
        || nav.querySelector<HTMLButtonElement>('[data-active="true"]');
      if (!active) return;
      revealSection(active);
    };
    const selected = nav.querySelector<HTMLButtonElement>('[data-active="true"]');
    if (selected) revealSection(selected);
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(revealCurrent) : null;
    observer?.observe(nav);
    return () => observer?.disconnect();
  }, [items, revealSection, selectedSubPage]);

  return (
    <nav ref={navRef} aria-label="Collection sections" className="collection-section-nav flex gap-1">
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.key === selectedSubPage;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelectSubPage(item.key)}
            onFocus={(event) => revealSection(event.currentTarget)}
            aria-label={item.label}
            title={item.label}
            {...getAriaCurrentPageProps(active)}
            data-active={active ? "true" : "false"}
            className={cn(
              "collection-section-link inline-flex items-center gap-2 rounded-md border px-3 py-2 text-left text-xs font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="collection-section-label-short" aria-hidden="true">{getCollectionSectionShortLabel(item.key, item.label)}</span>
          </button>
        );
      })}
    </nav>
  );
}

import { Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type SideTabNavigationItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  description?: string | null | undefined;
  badge?: number | string | null | undefined;
};

export type SideTabNavigationProps = {
  items: SideTabNavigationItem[];
  selectedKey: string;
  onSelect: (key: string) => void;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
  hideMobileTrigger?: boolean | undefined;
  collapsed: boolean;
  onCollapsedChange: (value: boolean) => void;
  menuLabel?: string | undefined;
  navigationLabel?: string | undefined;
  expandedWidth?: number | undefined;
  collapsedWidth?: number | undefined;
  className?: string | undefined;
};

const sideTabWidthClassByPixels = new Map<number, string>([
  [84, "w-[5.25rem]"],
  [88, "w-[5.5rem]"],
  [276, "w-[17.25rem]"],
  [296, "w-[18.5rem]"],
  [308, "w-[19.25rem]"],
]);

function resolveSideTabWidthClass(width: number, fallbackClassName: string) {
  return sideTabWidthClassByPixels.get(width) ?? fallbackClassName;
}

export function SideTabNavigation({
  items,
  selectedKey,
  onSelect,
  mobileOpen,
  onMobileOpenChange,
  hideMobileTrigger = false,
  collapsed,
  onCollapsedChange,
  menuLabel = "Menu",
  navigationLabel = "Navigation",
  expandedWidth = 276,
  collapsedWidth = 84,
  className,
}: SideTabNavigationProps) {
  const handleSelect = (key: string) => {
    onSelect(key);
    onMobileOpenChange(false);
  };
  const widthClassName = collapsed
    ? resolveSideTabWidthClass(collapsedWidth, "w-[5.25rem]")
    : resolveSideTabWidthClass(expandedWidth, "w-[17.25rem]");

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("lg:hidden", hideMobileTrigger ? "hidden" : "")}
        onClick={() => onMobileOpenChange(true)}
      >
        <Menu className="mr-2 h-4 w-4" />
        {menuLabel}
      </Button>

      <aside
        className={cn(
          "sticky top-5 hidden shrink-0 overflow-hidden rounded-[2rem] border border-border/65 bg-background/95 p-4 shadow-[0_22px_40px_-34px_hsl(222_47%_11%_/_0.2)] transition-[width] duration-150 ease-out motion-reduce:transition-none lg:block",
          widthClassName,
          className,
        )}
      >
        <div className={cn("mb-3 flex", collapsed ? "justify-center" : "justify-end")}>
          {collapsed ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11"
              aria-label="Expand navigation"
              title="Expand navigation"
              onClick={() => onCollapsedChange(false)}
            >
              <PanelLeftOpen className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11"
              aria-label="Collapse navigation"
              title="Collapse navigation"
              onClick={() => onCollapsedChange(true)}
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          )}
        </div>

        <nav className="space-y-1" aria-label={navigationLabel}>
          {items.map((item) => {
            const Icon = item.icon;
            const active = selectedKey === item.key;
            const showBadge = item.badge !== null && item.badge !== undefined && item.badge !== "";

            return (
              active ? (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleSelect(item.key)}
                  className={cn(
                    "relative flex min-h-[4.75rem] w-full items-center rounded-[1.4rem] px-3.5 py-3 text-sm transition-colors text-primary",
                    collapsed ? "justify-center" : "justify-start gap-3",
                  )}
                  aria-label={item.label}
                  aria-current="page"
                  title={collapsed ? item.label : item.description || item.label}
                >
                  <span
                    className="absolute inset-0 rounded-[1.4rem] border border-primary/35 bg-primary/10 shadow-[inset_0_1px_0_hsl(0_0%_100%_/_0.6)]"
                  />

                  <span className="relative z-10 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background shadow-sm">
                    <Icon className="h-4 w-4" />
                  </span>

                  {!collapsed ? (
                    <span className="relative z-10 flex min-w-0 flex-1 items-start justify-between gap-2">
                      <span className="min-w-0 space-y-0.5 text-left">
                        <span className="block truncate font-medium">{item.label}</span>
                        {item.description ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {item.description}
                          </span>
                        ) : null}
                      </span>
                      {showBadge ? (
                        <Badge variant="default" className="shrink-0">
                          {item.badge}
                        </Badge>
                      ) : null}
                    </span>
                  ) : null}
                </button>
              ) : (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleSelect(item.key)}
                  className={cn(
                    "relative flex min-h-[4.75rem] w-full items-center rounded-[1.4rem] px-3.5 py-3 text-sm transition-colors text-muted-foreground hover:bg-accent/35 hover:text-foreground",
                    collapsed ? "justify-center" : "justify-start gap-3",
                  )}
                  aria-label={item.label}
                  title={collapsed ? item.label : item.description || item.label}
                >
                  <span className="relative z-10 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background shadow-sm">
                    <Icon className="h-4 w-4" />
                  </span>

                  {!collapsed ? (
                    <span className="relative z-10 flex min-w-0 flex-1 items-start justify-between gap-2">
                      <span className="min-w-0 space-y-0.5 text-left">
                        <span className="block truncate font-medium">{item.label}</span>
                        {item.description ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {item.description}
                          </span>
                        ) : null}
                      </span>
                      {showBadge ? (
                        <Badge variant="secondary" className="shrink-0">
                          {item.badge}
                        </Badge>
                      ) : null}
                    </span>
                  ) : null}
                </button>
              )
            );
          })}
        </nav>
      </aside>

      {mobileOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[var(--z-mobile-nav-overlay)] bg-black/45 backdrop-blur-[1px] lg:hidden"
            aria-label="Close navigation menu"
            onClick={() => onMobileOpenChange(false)}
          />
          <aside
            className="fixed inset-y-0 left-0 z-[var(--z-mobile-nav-panel)] w-[320px] max-w-[92vw] border-r border-border/70 bg-background/98 p-4 shadow-2xl lg:hidden"
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold">{navigationLabel}</p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11"
                aria-label="Close navigation menu"
                title="Close navigation menu"
                onClick={() => onMobileOpenChange(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-1">
              {items.map((item) => {
                const Icon = item.icon;
                const active = selectedKey === item.key;
                const showBadge = item.badge !== null && item.badge !== undefined && item.badge !== "";

                return (
                  active ? (
                    <button
                      key={`mobile-${item.key}`}
                      type="button"
                      onClick={() => handleSelect(item.key)}
                      className="flex min-h-[4.75rem] w-full items-start gap-3 rounded-[1.35rem] border border-primary/35 bg-primary/10 px-3.5 py-3 text-left text-sm text-primary transition-colors"
                      aria-current="page"
                    >
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background shadow-sm">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1 space-y-0.5">
                        <span className="block truncate font-medium">{item.label}</span>
                        {item.description ? (
                          <span className="block text-xs text-muted-foreground">
                            {item.description}
                          </span>
                        ) : null}
                      </span>
                      {showBadge ? (
                        <Badge variant="default" className="shrink-0">
                          {item.badge}
                        </Badge>
                      ) : null}
                    </button>
                  ) : (
                    <button
                      key={`mobile-${item.key}`}
                      type="button"
                      onClick={() => handleSelect(item.key)}
                      className="flex min-h-[4.75rem] w-full items-start gap-3 rounded-[1.35rem] px-3.5 py-3 text-left text-sm text-muted-foreground transition-colors hover:bg-accent/35 hover:text-foreground"
                    >
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background shadow-sm">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1 space-y-0.5">
                        <span className="block truncate font-medium">{item.label}</span>
                        {item.description ? (
                          <span className="block text-xs text-muted-foreground">
                            {item.description}
                          </span>
                        ) : null}
                      </span>
                      {showBadge ? (
                        <Badge variant="secondary" className="shrink-0">
                          {item.badge}
                        </Badge>
                      ) : null}
                    </button>
                  )
                );
              })}
            </div>
          </aside>
        </>
      ) : null}
    </>
  );
}

import { Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type SideTabNavigationItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  description?: string | null;
  badge?: number | string | null;
};

export type SideTabNavigationProps = {
  items: SideTabNavigationItem[];
  selectedKey: string;
  onSelect: (key: string) => void;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
  hideMobileTrigger?: boolean;
  collapsed: boolean;
  onCollapsedChange: (value: boolean) => void;
  menuLabel?: string;
  navigationLabel?: string;
  expandedWidth?: number;
  collapsedWidth?: number;
  className?: string;
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
          "sticky top-4 hidden shrink-0 overflow-hidden rounded-xl border border-border/60 bg-background/70 p-2 shadow-sm transition-[width] duration-150 ease-out motion-reduce:transition-none lg:block",
          widthClassName,
          className,
        )}
      >
        <div className={cn("mb-2 flex", collapsed ? "justify-center" : "justify-end")}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11"
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            onClick={() => onCollapsedChange(!collapsed)}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </div>

        <nav className="space-y-1" aria-label={navigationLabel}>
          {items.map((item) => {
            const Icon = item.icon;
            const active = selectedKey === item.key;
            const showBadge = item.badge !== null && item.badge !== undefined && item.badge !== "";

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => handleSelect(item.key)}
                className={cn(
                  "relative flex min-h-11 w-full items-center rounded-lg px-2 py-2 text-sm transition-colors",
                  collapsed ? "justify-center" : "justify-start gap-3",
                  active ? "text-primary" : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                )}
                title={collapsed ? item.label : item.description || item.label}
              >
                {active ? (
                  <span
                    className="absolute inset-0 rounded-lg border border-primary/35 bg-primary/10"
                  />
                ) : null}

                <span className="relative z-10 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-background/60">
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
                      <Badge variant={active ? "default" : "secondary"} className="shrink-0">
                        {item.badge}
                      </Badge>
                    ) : null}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>
      </aside>

      {mobileOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[1px] lg:hidden"
            aria-label="Close navigation menu"
            onClick={() => onMobileOpenChange(false)}
          />
          <aside
            className="fixed inset-y-0 left-0 z-50 w-[290px] border-r border-border/70 bg-background p-3 shadow-xl lg:hidden"
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold">{navigationLabel}</p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11"
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
                  <button
                    key={`mobile-${item.key}`}
                    type="button"
                    onClick={() => handleSelect(item.key)}
                    className={cn(
                      "flex min-h-11 w-full items-start gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                      active
                        ? "border border-primary/35 bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                    )}
                  >
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-background/60">
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
                      <Badge variant={active ? "default" : "secondary"} className="shrink-0">
                        {item.badge}
                      </Badge>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </aside>
        </>
      ) : null}
    </>
  );
}

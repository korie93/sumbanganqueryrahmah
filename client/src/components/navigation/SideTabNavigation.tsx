import { AnimatePresence, motion } from "framer-motion";
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

type SideTabNavigationProps = {
  items: SideTabNavigationItem[];
  selectedKey: string;
  onSelect: (key: string) => void;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
  collapsed: boolean;
  onCollapsedChange: (value: boolean) => void;
  menuLabel?: string;
  navigationLabel?: string;
  expandedWidth?: number;
  collapsedWidth?: number;
  className?: string;
};

export function SideTabNavigation({
  items,
  selectedKey,
  onSelect,
  mobileOpen,
  onMobileOpenChange,
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

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="lg:hidden"
        onClick={() => onMobileOpenChange(true)}
      >
        <Menu className="mr-2 h-4 w-4" />
        {menuLabel}
      </Button>

      <motion.aside
        initial={false}
        animate={{ width: collapsed ? collapsedWidth : expandedWidth }}
        transition={{ duration: 0.16, ease: "easeOut" }}
        className={cn(
          "sticky top-4 hidden shrink-0 overflow-hidden rounded-xl border border-border/60 bg-background/70 p-2 shadow-sm lg:block",
          className,
        )}
      >
        <div className={cn("mb-2 flex", collapsed ? "justify-center" : "justify-end")}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
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
                  "relative flex w-full items-center rounded-lg px-2 py-2 text-sm transition-colors",
                  collapsed ? "justify-center" : "justify-start gap-3",
                  active ? "text-primary" : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                )}
                title={collapsed ? item.label : item.description || item.label}
              >
                {active ? (
                  <motion.span
                    layoutId={navigationLabel.replace(/\s+/g, "-").toLowerCase()}
                    className="absolute inset-0 rounded-lg border border-primary/35 bg-primary/10"
                    transition={{ duration: 0.14, ease: "easeOut" }}
                  />
                ) : null}

                <span className="relative z-10 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-background/60">
                  <Icon className="h-4 w-4" />
                </span>

                <AnimatePresence initial={false}>
                  {!collapsed ? (
                    <motion.span
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -6 }}
                      transition={{ duration: 0.16 }}
                      className="relative z-10 flex min-w-0 flex-1 items-start justify-between gap-2"
                    >
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
                    </motion.span>
                  ) : null}
                </AnimatePresence>
              </button>
            );
          })}
        </nav>
      </motion.aside>

      <AnimatePresence>
        {mobileOpen ? (
          <>
            <motion.button
              type="button"
              className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[1px] lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => onMobileOpenChange(false)}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 w-[290px] border-r border-border/70 bg-background p-3 shadow-xl lg:hidden"
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold">{navigationLabel}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
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
                        "flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
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
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}

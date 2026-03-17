import { Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
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
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="lg:hidden"
        onClick={() => onMobileOpenChange(true)}
      >
        <Menu className="mr-2 h-4 w-4" />
        Menu
      </Button>

      <motion.aside
        initial={false}
        animate={{ width: sidebarCollapsed ? 84 : 276 }}
        transition={{ duration: 0.16, ease: "easeOut" }}
        className="sticky top-4 hidden shrink-0 overflow-hidden rounded-xl border border-border/60 bg-background/70 p-2 shadow-sm lg:block"
      >
        <div className={cn("mb-2 flex", sidebarCollapsed ? "justify-center" : "justify-end")}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onSidebarCollapsedChange(!sidebarCollapsed)}
          >
            {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </div>
        <nav className="space-y-1">
          {items.map((item) => {
            const Icon = item.icon;
            const active = selectedSubPage === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onSelectSubPage(item.key)}
                className={cn(
                  "relative flex w-full items-center rounded-lg px-2 py-2 text-sm transition-colors",
                  sidebarCollapsed ? "justify-center" : "justify-start gap-3",
                  active ? "text-primary" : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                )}
                title={sidebarCollapsed ? item.label : undefined}
              >
                {active ? (
                  <motion.span
                    layoutId="collection-sidebar-active"
                    className="absolute inset-0 rounded-lg border border-primary/35 bg-primary/10"
                    transition={{ duration: 0.14, ease: "easeOut" }}
                  />
                ) : null}
                <span className="relative z-10 inline-flex h-7 w-7 items-center justify-center rounded-md bg-background/60">
                  <Icon className="h-4 w-4" />
                </span>
                <AnimatePresence initial={false}>
                  {!sidebarCollapsed ? (
                    <motion.span
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -6 }}
                      transition={{ duration: 0.16 }}
                      className="relative z-10 truncate font-medium"
                    >
                      {item.label}
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
                <p className="text-sm font-semibold">Collection Navigation</p>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onMobileOpenChange(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-1">
                {items.map((item) => {
                  const Icon = item.icon;
                  const active = selectedSubPage === item.key;
                  return (
                    <button
                      key={`mobile-${item.key}`}
                      type="button"
                      onClick={() => onSelectSubPage(item.key)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                        active
                          ? "border border-primary/35 bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                      )}
                    >
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-background/60">
                        <Icon className="h-4 w-4" />
                      </span>
                      {item.label}
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

import { useMemo, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { getAriaCurrentPageProps, getAriaExpandedProps } from "@/lib/aria-state-props";
import { cn } from "@/lib/utils";
import { getSettingsCategoryIcon } from "@/pages/settings/settings-sidebar-icons";
import { BACKUP_SETTINGS_CATEGORY_ID } from "@/pages/settings/settings-controller-utils";
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
  selectedCategory,
}: SettingsSidebarProps) {
  const isMobile = useIsMobile();
  const launcherRef = useRef<HTMLButtonElement>(null);
  const items = useMemo(
    () =>
      categories.map((category) => ({
        key: category.id,
        // The server's backup configuration category and the backup workspace
        // are separate destinations. Distinguish their labels, not their access.
        label: category.name === "Backup & Restore" && category.id !== BACKUP_SETTINGS_CATEGORY_ID
          ? "Backup Settings"
          : category.name,
        icon: getSettingsCategoryIcon(category),
        description: category.description,
        badge: categoryDirtyMap.get(category.id) || null,
      })),
    [categories, categoryDirtyMap],
  );
  const selectedItem = items.find((item) => item.key === selectedCategory) ?? items[0] ?? null;
  const renderItems = (inSheet: boolean) => items.map((item) => {
    const Icon = item.icon;
    const active = item.key === selectedCategory;
    return (
      <Button
        key={item.key}
        type="button"
        variant="ghost"
        onClick={() => {
          onSelectCategory(item.key);
          if (inSheet) onMobileOpenChange(false);
        }}
        {...getAriaCurrentPageProps(active)}
        data-active={active ? "true" : "false"}
        title={item.description ?? undefined}
        className={cn(
          "h-auto justify-start gap-2 whitespace-normal text-left font-medium",
          inSheet ? "min-h-11 w-full items-start px-3 py-3" : "min-h-9 px-3 py-2 text-xs",
          active ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0">
          <span className="block">{item.label}</span>
          {inSheet && item.description ? <span className="mt-1 block text-xs font-normal text-muted-foreground">{item.description}</span> : null}
        </span>
        {item.badge !== null ? (
          <Badge variant="secondary" className="ml-auto shrink-0" aria-label={`${item.badge} unsaved changes`}>{item.badge}</Badge>
        ) : null}
      </Button>
    );
  });

  if (!isMobile) {
    return <nav aria-label="Settings Navigation" className="flex flex-wrap gap-1 border-b border-border pb-3">{renderItems(false)}</nav>;
  }

  return (
    <>
      <Button
        ref={launcherRef}
        type="button"
        variant="outline"
        className="min-h-11 w-full justify-between gap-3"
        onClick={() => onMobileOpenChange(true)}
        aria-label={`Browse Settings: ${selectedItem?.label || "Choose a section"}`}
        aria-haspopup="dialog"
        {...getAriaExpandedProps(mobileOpen)}
        data-testid="button-open-settings-sections"
      >
        <span className="min-w-0 truncate">{selectedItem?.label || "Choose a section"}</span>
        <span className="ml-auto text-xs text-muted-foreground">{items.length} sections</span>
        <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
      </Button>
      <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent
          side="left"
          className="w-[min(92vw,22rem)]"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (launcherRef.current?.isConnected) launcherRef.current.focus({ preventScroll: true });
          }}
        >
          <SheetHeader className="pr-8 text-left">
            <SheetTitle>Settings Menu</SheetTitle>
            <SheetDescription>Choose a section. Badges show unsaved changes.</SheetDescription>
          </SheetHeader>
          <nav aria-label="Settings Navigation" className="mt-4 space-y-1">{renderItems(true)}</nav>
        </SheetContent>
      </Sheet>
    </>
  );
}

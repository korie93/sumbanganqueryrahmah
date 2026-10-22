import { useMemo, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { getAriaCurrentPageProps, getAriaExpandedProps } from "@/lib/aria-state-props";
import { cn } from "@/lib/utils";
import { getSettingsCategoryIcon } from "@/pages/settings/settings-sidebar-icons";
import { getSettingsCategoryLabel } from "@/pages/settings/settings-controller-utils";
import type { SettingCategory } from "@/pages/settings/types";

interface SettingsSidebarProps {
  compact?: boolean;
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
  compact = false,
  categories,
  categoryDirtyMap,
  mobileOpen,
  onMobileOpenChange,
  onSelectCategory,
  selectedCategory,
}: SettingsSidebarProps) {
  const isMobile = useIsMobile();
  const launcherRef = useRef<HTMLButtonElement>(null);
  const navigationRef = useRef<HTMLElement>(null);
  const items = useMemo(
    () =>
      categories.map((category) => ({
        key: category.id,
        // The server's backup configuration category and the backup workspace
        // are separate destinations. Distinguish their labels, not their access.
        label: getSettingsCategoryLabel(category),
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
          "h-auto min-h-11 max-w-full justify-start gap-2 whitespace-normal text-left text-sm font-medium sm:min-h-11",
          inSheet ? "w-full items-start px-3 py-3" : "px-3 py-2",
          active ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 break-words">
          <span className="block">{item.label}</span>
          {inSheet && item.description ? <span className="mt-1 block text-xs font-normal leading-5 text-muted-foreground">{item.description}</span> : null}
        </span>
        {item.badge !== null ? (
          <Badge variant="secondary" className="ml-auto shrink-0" aria-label={`${item.badge} unsaved changes`}>{item.badge}</Badge>
        ) : null}
      </Button>
    );
  });

  if (!isMobile && !compact) {
    return <nav ref={navigationRef} aria-label="Settings Navigation" className="flex min-w-0 flex-wrap gap-1 rounded-lg border border-border/70 bg-muted/20 p-1.5">{renderItems(false)}</nav>;
  }

  return (
    <>
      <Button
        ref={launcherRef}
        type="button"
        variant="outline"
        className={cn("h-auto min-h-11 max-w-full gap-3 rounded-lg border-border/70 bg-muted/20 px-3 py-2 text-left text-sm shadow-none sm:min-h-11",
          compact ? "w-full justify-start sm:w-fit" : "w-full justify-between",
        )}
        onClick={() => onMobileOpenChange(true)}
        aria-label={`Browse Settings: ${selectedItem?.label || "Choose a section"}`}
        aria-haspopup="dialog"
        {...getAriaExpandedProps(mobileOpen)}
        data-testid="button-open-settings-sections"
      >
        <span className="flex min-w-0 items-start gap-2 whitespace-normal">
          <span className="shrink-0 text-muted-foreground">Settings</span>
          <span aria-hidden="true" className="shrink-0 text-muted-foreground">/</span>
          <span className="min-w-0 break-words text-foreground">{selectedItem?.label || "Choose a section"}</span>
        </span>
        {!compact ? <span className="ml-auto hidden shrink-0 text-xs text-muted-foreground sm:inline">{items.length} sections</span> : null}
        <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
      </Button>
      <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent
          side="left"
          className="w-[min(92vw,22rem)] [&>button]:right-2 [&>button]:top-2 [&>button]:inline-flex [&>button]:min-h-11 [&>button]:min-w-11 [&>button]:items-center [&>button]:justify-center"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (launcherRef.current?.isConnected) launcherRef.current.focus({ preventScroll: true });
            else navigationRef.current?.querySelector<HTMLButtonElement>('button[aria-current="page"]')?.focus({ preventScroll: true });
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

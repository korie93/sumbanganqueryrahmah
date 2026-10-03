import { memo, useRef } from "react";
import { ChevronRight } from "lucide-react";
import type { NavigationEntry, NavigationGroup } from "@/app/navigation";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatSavedCountBadge } from "@/components/navbar-utils";
import { getAriaCurrentPageProps, getAriaExpandedProps } from "@/lib/aria-state-props";

type NavbarDesktopNavigationProps = {
  directItems: NavigationEntry[];
  groupedItems: NavigationGroup[];
  activeNavigationItemId: string;
  savedCount?: number | undefined;
  onNavigate: (itemId: string) => void;
  onPrefetch: (itemId: string) => void;
  collapsed: boolean;
  activeGroup: string | null;
  onGroupChange: (groupId: string | null, focusFirst?: boolean) => void;
};

function NavbarDesktopNavigationImpl({
  directItems, groupedItems, activeNavigationItemId, savedCount,
  onNavigate, onPrefetch, collapsed, activeGroup, onGroupChange,
}: NavbarDesktopNavigationProps) {
  const groupTriggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const keyboardOpening = useRef(false);
  const restoreFocus = useRef(false);

  return (
    <div className="navbar-nav-shell hidden min-w-0 flex-1 lg:flex">
      <nav aria-label="Primary navigation" className="w-full min-w-0">
        <div className="workspace-navigation-items navbar-premium-glass">
          {directItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeNavigationItemId === item.id;
            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>
                  <button type="button" aria-label={item.title || item.label}
                    {...getAriaCurrentPageProps(isActive)}
                    onClick={() => onNavigate(item.id)}
                    onMouseEnter={() => onPrefetch(item.id)} onFocus={() => onPrefetch(item.id)}
                    data-testid={`nav-${item.id}`} className={`nav-pill${isActive ? " nav-pill-active" : ""}`}>
                    <span className="nav-pill-icon"><Icon className="h-4 w-4" aria-hidden="true" /></span>
                    <span className="nav-pill-label">{item.id === "general-search" ? item.title : item.label}</span>
                  </button>
                </TooltipTrigger>
                {collapsed ? <TooltipContent side="right">{item.title || item.label}</TooltipContent> : null}
              </Tooltip>
            );
          })}
          {groupedItems.map((group) => {
            const Icon = group.icon;
            const active = group.items.some((item) => item.id === activeNavigationItemId);
            const open = activeGroup === group.id;
            const panelId = `desktop-flyout-${group.id}`;
            return (
              <Popover key={group.id} modal={false} open={open} onOpenChange={(nextOpen) => {
                if (!nextOpen && !open) return;
                onGroupChange(nextOpen ? group.id : null);
              }}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <button ref={(node) => {
                        if (node) groupTriggerRefs.current.set(group.id, node);
                        else groupTriggerRefs.current.delete(group.id);
                      }} type="button" aria-label={group.label} aria-haspopup={undefined}
                        aria-controls={panelId} {...getAriaExpandedProps(open)}
                        {...getAriaCurrentPageProps(active)}
                        onClick={() => { restoreFocus.current = false; }}
                        onPointerDown={() => { keyboardOpening.current = false; }}
                        onKeyDown={(event) => {
                          if (event.key === "ArrowRight") {
                            event.preventDefault();
                            keyboardOpening.current = true;
                            onGroupChange(group.id, true);
                          } else if (event.key === "Enter" || event.key === " ") {
                            keyboardOpening.current = true;
                          }
                        }}
                        onMouseEnter={() => group.items.forEach((item) => onPrefetch(item.id))}
                        onFocus={() => group.items.forEach((item) => onPrefetch(item.id))}
                        className={`nav-pill${active ? " nav-pill-active" : ""}${open ? " nav-parent-open" : ""}`}
                        data-testid={`nav-group-${group.id}`}>
                        <span className="nav-pill-icon"><Icon className="h-4 w-4" aria-hidden="true" /></span>
                        <span className="nav-pill-label">{group.label}</span>
                        <ChevronRight className="nav-group-chevron h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  {collapsed ? <TooltipContent side="right">{group.label}</TooltipContent> : null}
                </Tooltip>
                <PopoverContent asChild side="right" align="start" sideOffset={20} collisionPadding={12}
                  onOpenAutoFocus={(event) => {
                    event.preventDefault();
                    if (keyboardOpening.current) document.getElementById(panelId)?.querySelector<HTMLButtonElement>("button")?.focus();
                  }}
                  onEscapeKeyDown={() => { restoreFocus.current = true; }}
                  onCloseAutoFocus={(event) => {
                    event.preventDefault();
                    if (restoreFocus.current) groupTriggerRefs.current.get(group.id)?.focus({ preventScroll: true });
                    restoreFocus.current = false;
                  }}
                  onInteractOutside={(event) => {
                    // A parent click owns switching/toggling, before outside dismissal.
                    if (event.target instanceof Element && event.target.closest('[data-testid^="nav-group-"]')) event.preventDefault();
                  }}
                  className="workspace-nav-flyout">
                  <nav role="navigation" id={panelId} data-testid={panelId} aria-label={`${group.label} modules`}>
                    <div className="workspace-flyout-heading"><strong>{group.label}</strong><p>{group.description}</p></div>
                    {group.items.map((item) => {
                      const ItemIcon = item.icon;
                      const activeItem = activeNavigationItemId === item.id;
                      const badge = item.id === "saved" ? formatSavedCountBadge(savedCount) : null;
                      return (
                        <button key={item.id} type="button" className={`workspace-flyout-item${activeItem ? " is-active" : ""}`}
                          data-testid={`flyout-nav-${item.id}`} {...getAriaCurrentPageProps(activeItem)}
                          onClick={() => onNavigate(item.id)} onFocus={() => onPrefetch(item.id)}>
                          <ItemIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                          <span><strong>{item.title || item.label}{badge ? ` (${badge})` : ""}</strong><small>{item.description}</small></span>
                        </button>
                      );
                    })}
                  </nav>
                </PopoverContent>
              </Popover>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

/** Permission-filtered desktop navigation with nonmodal right-side flyouts. */
export const NavbarDesktopNavigation = memo(NavbarDesktopNavigationImpl);

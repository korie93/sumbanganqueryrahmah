import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { formatNavigationLabel, type NavigationEntry, type NavigationGroup } from "@/app/navigation";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getAriaCurrentPageProps, getAriaExpandedProps } from "@/lib/aria-state-props";

type NavbarMobileNavigationProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus: (event: Event) => void;
  directItems: NavigationEntry[];
  groupedItems: NavigationGroup[];
  activeMobileItemId: string;
  savedCount?: number | undefined;
  onNavigate: (itemId: string) => void;
  onPrefetch: (itemId: string) => void;
  profile: ReactNode;
  profileOpen: boolean;
};

function NavbarMobileNavigationImpl({
  open, onOpenChange, onCloseAutoFocus, directItems, groupedItems,
  activeMobileItemId, savedCount, onNavigate, onPrefetch, profile, profileOpen,
}: NavbarMobileNavigationProps) {
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const groupRefs = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => { if (!open) setActiveGroup(null); }, [open]);
  useEffect(() => {
    if (activeGroup && !groupedItems.some((group) => group.id === activeGroup)) setActiveGroup(null);
  }, [activeGroup, groupedItems]);
  const renderItem = (item: NavigationEntry, child = false) => {
    const Icon = item.icon;
    const active = item.id === activeMobileItemId;
    return (
      <button key={item.id} type="button" {...getAriaCurrentPageProps(active)}
        data-testid={`mobile-nav-${item.id}`}
        onClick={() => { onNavigate(item.id); onOpenChange(false); }}
        onMouseEnter={() => onPrefetch(item.id)} onFocus={() => onPrefetch(item.id)}
        className={`workspace-mobile-item${active ? " is-active" : ""}${child ? " is-child" : ""}`}>
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{formatNavigationLabel(child ? item.title || item.label : item.label, item.id, savedCount)}</span>
          {child && item.description ? <small className="mt-1 block text-xs leading-relaxed text-muted-foreground">{item.description}</small> : null}
        </span>
        {active ? <span className="rounded-sm bg-primary px-1.5 py-0.5 text-xs font-medium text-primary-foreground">Current</span> : null}
      </button>
    );
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent onCloseAutoFocus={onCloseAutoFocus} id="mobile-navigation-drawer" side="left"
        className="workspace-mobile-navigation w-[min(92vw,20rem)]"
        onEscapeKeyDown={(event) => {
          if (profileOpen) { event.preventDefault(); return; }
          if (activeGroup) {
            event.preventDefault();
            groupRefs.current.get(activeGroup)?.focus({ preventScroll: true });
            setActiveGroup(null);
          }
        }}>
        <SheetHeader className="pr-8 text-left">
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription>Operations workspace</SheetDescription>
        </SheetHeader>
        <nav className="workspace-mobile-nav-list" aria-label="Mobile navigation">
          {directItems.map((item) => renderItem(item))}
          {groupedItems.map((group) => {
            const Icon = group.icon;
            const expanded = activeGroup === group.id;
            const active = group.items.some((item) => item.id === activeMobileItemId);
            return (
              <div key={group.id}>
                <button type="button" ref={(node) => {
                  if (node) groupRefs.current.set(group.id, node);
                  else groupRefs.current.delete(group.id);
                }} className={`workspace-mobile-item${active ? " is-active" : ""}`}
                  {...getAriaExpandedProps(expanded)} aria-controls={`mobile-submenu-${group.id}`}
                  data-testid={`mobile-nav-group-${group.id}`}
                  onClick={() => setActiveGroup(expanded ? null : group.id)}>
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="flex-1 text-left">{group.label}</span>
                  <ChevronDown className={`h-4 w-4${expanded ? " rotate-180" : ""}`} aria-hidden="true" />
                </button>
                {expanded ? <div id={`mobile-submenu-${group.id}`} data-testid={`mobile-submenu-${group.id}`} className="workspace-mobile-submenu">
                  {group.items.map((item) => renderItem(item, true))}
                </div> : null}
              </div>
            );
          })}
        </nav>
        <div className="workspace-mobile-profile">{profile}</div>
      </SheetContent>
    </Sheet>
  );
}

/** Accessible mobile drawer with mutually exclusive inline navigation groups. */
export const NavbarMobileNavigation = memo(NavbarMobileNavigationImpl);

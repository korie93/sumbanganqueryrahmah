import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Menu, Moon, PanelLeftClose, PanelLeftOpen, Sun } from "lucide-react";
import { useLocation, useSearch } from "wouter";
import {
  getVisibleNavItems, getVisibleNavigationGroups, getVisiblePrimaryNavItems,
  resolveNavigationTarget, resolveActiveNavigationItemId,
} from "@/app/navigation";
import { prefetchNavigationTargetWithDiagnostics } from "@/app/navigation-prefetch";
import type { MonitorSection, TabVisibility } from "@/app/types";
import { NavbarCommandSearch } from "@/components/NavbarCommandSearch";
import { NavbarDesktopNavigation } from "@/components/NavbarDesktopNavigation";
import { NavbarMobileNavigation } from "@/components/NavbarMobileNavigation";
import { NavbarNotificationCenter } from "@/components/NavbarNotificationCenter";
import { NavbarBrandCluster, NavbarUserMenuDropdown } from "@/components/NavbarParts";
import { useSidebarExpansion } from "@/components/useSidebarExpansion";
import { useTheme } from "@/components/useTheme";
import {
  clearNotificationHistory, markNotificationHistoryRead, removeNotificationHistoryEntry,
  useNotificationHistoryState,
} from "@/hooks/use-notification-history";
import { LARGE_UP_MEDIA_QUERY } from "@/lib/responsive";
import { getAriaExpandedProps } from "@/lib/aria-state-props";
import "./Navbar.css";

interface NavbarProps {
  currentPage: string;
  onNavigate: (page: string, importId?: string) => void;
  onLogout: () => void | Promise<void>;
  userRole: string;
  username: string;
  avatarUrl?: string | null | undefined;
  systemName?: string | undefined;
  savedCount?: number | undefined;
  tabVisibility?: TabVisibility | undefined;
  featureLockdown?: boolean | undefined;
  monitorSection?: MonitorSection | undefined;
  sidebarCollapsed?: boolean | undefined;
  onSidebarCollapsedChange?: ((collapsed: boolean) => void) | undefined;
}
type UtilityLayer = "search" | "notification" | "profile-desktop" | "profile-mobile" | null;

function NavbarImpl({
  currentPage, onNavigate, onLogout, userRole, username, avatarUrl, systemName, savedCount,
  tabVisibility, featureLockdown = false, monitorSection, sidebarCollapsed = false, onSidebarCollapsedChange,
}: NavbarProps) {
  const { theme, setTheme } = useTheme();
  const [routerLocation] = useLocation();
  const routerSearch = useSearch();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [utilityLayer, setUtilityLayer] = useState<UtilityLayer>(null);
  const [desktop, setDesktop] = useState(() => typeof window !== "undefined" && window.matchMedia(LARGE_UP_MEDIA_QUERY).matches);
  const sidebarRef = useRef<HTMLElement>(null);
  const desktopUserMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileUserMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileNavigationTriggerRef = useRef<HTMLButtonElement>(null);
  const desktopNavigationTriggerRef = useRef<HTMLButtonElement>(null);
  const notificationHistory = useNotificationHistoryState();
  const { afterExpansion, cancelExpansion } = useSidebarExpansion(sidebarCollapsed, onSidebarCollapsedChange, sidebarRef);

  const directItems = useMemo(() => getVisiblePrimaryNavItems(userRole, tabVisibility ?? null, featureLockdown), [featureLockdown, tabVisibility, userRole]);
  const groupedItems = useMemo(() => getVisibleNavigationGroups(userRole, tabVisibility ?? null, featureLockdown), [featureLockdown, tabVisibility, userRole]);
  const allItems = useMemo(() => getVisibleNavItems(userRole, tabVisibility ?? null, featureLockdown), [featureLockdown, tabVisibility, userRole]);
  const mobileDirectItems = useMemo(() => allItems.filter((item) => item.id === "home" || directItems.some((direct) => direct.id === item.id)), [allItems, directItems]);
  const showHomeButton = allItems.some((item) => item.id === "home");
  const canAccessSettings = allItems.some((item) => item.id === "settings");
  const activeNavigationItemId = useMemo(() => {
    const queryIndex = routerLocation.indexOf("?");
    return resolveActiveNavigationItemId(currentPage, {
      monitorSection, pathname: queryIndex < 0 ? routerLocation : routerLocation.slice(0, queryIndex),
      search: queryIndex < 0 ? routerSearch : routerLocation.slice(queryIndex),
    });
  }, [currentPage, monitorSection, routerLocation, routerSearch]);
  const activeItem = allItems.find((item) => item.id === activeNavigationItemId);
  const activeContext = currentPage === "account" ? "Account" : currentPage === "security" ? "Security" : activeItem?.title || activeItem?.label || systemName || "SQR Workspace";

  const closeLayers = useCallback(() => {
    cancelExpansion();
    setActiveGroup(null);
    setUtilityLayer(null);
  }, [cancelExpansion]);

  useEffect(() => {
    closeLayers();
    setMobileNavOpen(false);
  }, [closeLayers, currentPage, monitorSection, routerLocation, routerSearch]);

  useEffect(() => {
    if (activeGroup && !groupedItems.some((group) => group.id === activeGroup)) setActiveGroup(null);
  }, [activeGroup, groupedItems]);

  useEffect(() => {
    const media = window.matchMedia(LARGE_UP_MEDIA_QUERY);
    const changeViewport = () => {
      setDesktop(media.matches);
      closeLayers();
      if (media.matches) setMobileNavOpen(false);
    };
    const resize = () => { closeLayers(); };
    const cancelOutsideExpansion = (event: PointerEvent) => {
      if (event.target instanceof Node && !sidebarRef.current?.contains(event.target)) cancelExpansion();
    };
    const cancelPendingOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancelExpansion();
    };
    media.addEventListener("change", changeViewport);
    window.addEventListener("resize", resize);
    document.addEventListener("pointerdown", cancelOutsideExpansion);
    document.addEventListener("keydown", cancelPendingOnEscape);
    return () => {
      media.removeEventListener("change", changeViewport);
      window.removeEventListener("resize", resize);
      document.removeEventListener("pointerdown", cancelOutsideExpansion);
      document.removeEventListener("keydown", cancelPendingOnEscape);
    };
  }, [cancelExpansion, closeLayers]);

  const navigateToItem = useCallback((itemId: string) => {
    closeLayers();
    setMobileNavOpen(false);
    if (desktop && sidebarCollapsed) onSidebarCollapsedChange?.(false);
    onNavigate(resolveNavigationTarget(itemId));
  }, [closeLayers, desktop, onNavigate, onSidebarCollapsedChange, sidebarCollapsed]);
  const prefetchItem = useCallback((itemId: string) => {
    void prefetchNavigationTargetWithDiagnostics(resolveNavigationTarget(itemId), { source: "navbar", itemId });
  }, []);
  const changeGroup = useCallback((groupId: string | null, focusFirst = false) => {
    if (!groupId) { setActiveGroup(null); cancelExpansion(); return; }
    setUtilityLayer(null);
    afterExpansion(() => {
      setActiveGroup(groupId);
      if (focusFirst && groupId === activeGroup) document.getElementById(`desktop-flyout-${groupId}`)?.querySelector<HTMLButtonElement>("button")?.focus();
    });
  }, [activeGroup, afterExpansion, cancelExpansion]);
  const toggleSidebar = useCallback(() => {
    closeLayers();
    onSidebarCollapsedChange?.(!sidebarCollapsed);
  }, [closeLayers, onSidebarCollapsedChange, sidebarCollapsed]);
  const toggleTheme = useCallback(() => {
    closeLayers();
    setTheme(theme === "dark" ? "light" : "dark");
  }, [closeLayers, setTheme, theme]);
  const changeUtility = useCallback((layer: Exclude<UtilityLayer, null>, open: boolean) => {
    if (!open) {
      setUtilityLayer((current) => current === layer ? null : current);
      cancelExpansion();
      return;
    }
    closeLayers();
    if (layer === "search") setMobileNavOpen(false);
    if (layer === "profile-desktop") afterExpansion(() => setUtilityLayer(layer));
    else setUtilityLayer(layer);
  }, [afterExpansion, cancelExpansion, closeLayers]);
  const changeMobileNav = useCallback((open: boolean) => {
    closeLayers();
    setMobileNavOpen(open);
  }, [closeLayers]);
  const restoreMobileNavigationFocus = useCallback((event: Event) => {
    event.preventDefault();
    if (window.matchMedia(LARGE_UP_MEDIA_QUERY).matches) desktopNavigationTriggerRef.current?.focus({ preventScroll: true });
    else mobileNavigationTriggerRef.current?.focus({ preventScroll: true });
  }, []);
  const navigateProfile = useCallback((page: "account" | "security" | "settings") => {
    closeLayers();
    setMobileNavOpen(false);
    onNavigate(page);
  }, [closeLayers, onNavigate]);

  const profile = (variant: "desktop" | "mobile") => (
    <NavbarUserMenuDropdown variant={variant} open={utilityLayer === `profile-${variant}`}
      onOpenChange={(open) => changeUtility(`profile-${variant}`, open)}
      triggerRef={variant === "desktop" ? desktopUserMenuTriggerRef : mobileUserMenuTriggerRef}
      username={username} userRole={userRole} collapsed={variant === "desktop" && sidebarCollapsed}
      avatarUrl={avatarUrl} canAccessSettings={canAccessSettings} onAccount={() => navigateProfile("account")}
      onSecurity={() => navigateProfile("security")} onSettings={() => navigateProfile("settings")} onLogout={onLogout} />
  );

  return (
    <>
      <aside ref={sidebarRef} className="workspace-sidebar" aria-label="Workspace sidebar"
        onClickCapture={(event) => {
          if (sidebarCollapsed && event.target instanceof Element && !event.target.closest("button,a")) onSidebarCollapsedChange?.(false);
        }}>
        <NavbarBrandCluster activeNavigationItemId={activeNavigationItemId} showHomeButton={showHomeButton}
          systemName={systemName} onNavigate={navigateToItem} onPrefetch={prefetchItem} collapsed={sidebarCollapsed}
          collapseControl={<button ref={desktopNavigationTriggerRef} type="button" className="workspace-sidebar-toggle"
            aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
            title={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
            {...getAriaExpandedProps(!sidebarCollapsed)} onClick={toggleSidebar} data-testid="button-toggle-sidebar">
            {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" aria-hidden="true" /> : <PanelLeftClose className="h-4 w-4" aria-hidden="true" />}
          </button>} />
        <NavbarDesktopNavigation directItems={directItems} groupedItems={groupedItems} activeNavigationItemId={activeNavigationItemId}
          savedCount={savedCount} onNavigate={navigateToItem} onPrefetch={prefetchItem} collapsed={sidebarCollapsed}
          activeGroup={activeGroup} onGroupChange={changeGroup} />
        <div className="workspace-sidebar-footer">{profile("desktop")}</div>
      </aside>
      <header className="navbar-safe-area-shell workspace-topbar">
        <div className="workspace-topbar-inner">
          <div className="workspace-mobile-context">
            <button ref={mobileNavigationTriggerRef} type="button" className="nav-mobile-trigger"
              aria-label="Open navigation" aria-haspopup="dialog" aria-controls="mobile-navigation-drawer"
              {...getAriaExpandedProps(mobileNavOpen)} onClick={() => changeMobileNav(true)} data-testid="button-open-mobile-nav">
              <Menu className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="workspace-context-current" title={activeContext}>{activeContext}</span>
          </div>
          <div className="workspace-desktop-context">
            <span className="workspace-context-current" title={activeContext}>{activeContext}</span>
          </div>
          <NavbarCommandSearch items={allItems} desktop={desktop} open={utilityLayer === "search"} onOpenChange={(open) => changeUtility("search", open)}
            onNavigate={navigateToItem} theme={theme} onToggleTheme={toggleTheme}
            sidebarCollapsed={sidebarCollapsed} onToggleSidebar={toggleSidebar} />
          <div className="workspace-topbar-utilities">
            <button type="button" className="nav-theme-trigger" data-testid="button-toggle-theme"
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} onClick={toggleTheme}>
              {theme === "dark" ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
            </button>
            <span className="workspace-utility-divider" aria-hidden="true" />
            <NavbarNotificationCenter {...notificationHistory} variant={desktop ? "desktop" : "mobile"}
              open={utilityLayer === "notification"} onOpenChange={(open) => changeUtility("notification", open)}
              onClear={clearNotificationHistory} onDismissEntry={removeNotificationHistoryEntry} onMarkRead={markNotificationHistoryRead} />
          </div>
        </div>
      </header>
      <NavbarMobileNavigation open={mobileNavOpen} onOpenChange={changeMobileNav} onCloseAutoFocus={restoreMobileNavigationFocus}
        directItems={mobileDirectItems} groupedItems={groupedItems} activeMobileItemId={activeNavigationItemId}
        savedCount={savedCount} onNavigate={navigateToItem} onPrefetch={prefetchItem}
        profile={profile("mobile")} profileOpen={utilityLayer === "profile-mobile"} />
    </>
  );
}

export default memo(NavbarImpl);

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ChevronRight, Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { useLocation } from "wouter"

import {
  getVisibleNavItems,
  getVisibleNavigationGroups,
  getVisiblePrimaryNavItems,
  resolveNavigationTarget,
  resolveActiveNavigationItemId,
} from "@/app/navigation"
import { prefetchNavigationTargetWithDiagnostics } from "@/app/navigation-prefetch"
import type { MonitorSection, TabVisibility } from "@/app/types"
import { NavbarDesktopNavigation } from "@/components/NavbarDesktopNavigation"
import { NavbarMobileNavigation } from "@/components/NavbarMobileNavigation"
import { NavbarNotificationCenter } from "@/components/NavbarNotificationCenter"
import { NavbarBrandCluster, NavbarUserMenuDropdown } from "@/components/NavbarParts"
import {
  resolveNavbarActiveMobileItemId,
  resolveNavbarShowHomeButton,
} from "@/components/navbar-utils"
import { useTheme } from "@/components/useTheme"
import {
  clearNotificationHistory,
  markNotificationHistoryRead,
  removeNotificationHistoryEntry,
  useNotificationHistoryState,
} from "@/hooks/use-notification-history"
import { getAriaExpandedProps } from "@/lib/aria-state-props"
import { translate } from "@/lib/i18n"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import "./Navbar.css"

interface NavbarProps {
  currentPage: string
  onNavigate: (page: string, importId?: string) => void
  onLogout: () => void | Promise<void>
  userRole: string
  username: string
  systemName?: string | undefined
  savedCount?: number | undefined
  tabVisibility?: TabVisibility | undefined
  featureLockdown?: boolean | undefined
  monitorSection?: MonitorSection | undefined
  sidebarCollapsed?: boolean | undefined
  onSidebarCollapsedChange?: ((collapsed: boolean) => void) | undefined
}

function NavbarImpl({
  currentPage,
  onNavigate,
  onLogout,
  userRole,
  username,
  systemName,
  savedCount,
  tabVisibility,
  featureLockdown = false,
  monitorSection,
  sidebarCollapsed = false,
  onSidebarCollapsedChange,
}: NavbarProps) {
  const { theme, setTheme } = useTheme()
  const [routerLocation] = useLocation()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const notificationHistory = useNotificationHistoryState()
  const desktopUserMenuTriggerRef = useRef<HTMLButtonElement>(null)
  const mobileUserMenuTriggerRef = useRef<HTMLButtonElement>(null)
  const mobileNavigationTriggerRef = useRef<HTMLButtonElement>(null)
  const desktopNavigationTriggerRef = useRef<HTMLButtonElement>(null)
  const navbarMountedRef = useRef(true)
  const pendingFocusFramesRef = useRef<number[]>([])

  const directItems = useMemo(
    () => getVisiblePrimaryNavItems(userRole, tabVisibility ?? null, featureLockdown),
    [featureLockdown, tabVisibility, userRole]
  )
  const groupedItems = useMemo(
    () => getVisibleNavigationGroups(userRole, tabVisibility ?? null, featureLockdown),
    [featureLockdown, tabVisibility, userRole]
  )
  const mobileItems = useMemo(
    () => getVisibleNavItems(userRole, tabVisibility ?? null, featureLockdown),
    [featureLockdown, tabVisibility, userRole]
  )

  const showHomeButton = useMemo(
    () => resolveNavbarShowHomeButton(mobileItems),
    [mobileItems]
  )
  const activeLocation = useMemo(() => {
    const queryIndex = routerLocation.indexOf("?")
    return queryIndex >= 0
      ? {
        pathname: routerLocation.slice(0, queryIndex),
        search: routerLocation.slice(queryIndex),
      }
      : {
        pathname: routerLocation,
        search: "",
      }
  }, [routerLocation])

  useEffect(() => {
    setMobileNavOpen(false)
  }, [activeLocation.pathname])

  useEffect(() => {
    if (!mobileNavOpen) return
    const desktop = window.matchMedia("(min-width: 1024px)")
    const closeOnDesktop = () => {
      if (desktop.matches) setMobileNavOpen(false)
    }
    closeOnDesktop()
    desktop.addEventListener("change", closeOnDesktop)
    return () => desktop.removeEventListener("change", closeOnDesktop)
  }, [mobileNavOpen])

  const activeNavigationItemId = useMemo(
    () =>
      resolveActiveNavigationItemId(currentPage, {
        monitorSection,
        pathname: activeLocation.pathname,
        search: activeLocation.search,
      }),
    [activeLocation.pathname, activeLocation.search, currentPage, monitorSection]
  )
  const activeMobileItemId = useMemo(
    () => resolveNavbarActiveMobileItemId(mobileItems, activeNavigationItemId),
    [activeNavigationItemId, mobileItems]
  )
  const mobileNavTriggerExpandedProps = getAriaExpandedProps(mobileNavOpen)

  const clearPendingUserMenuFocusFrames = useCallback(() => {
    if (typeof window !== "undefined") {
      for (const frameHandle of pendingFocusFramesRef.current) {
        window.cancelAnimationFrame(frameHandle)
      }
    }
    pendingFocusFramesRef.current = []
  }, [])

  useEffect(() => {
    navbarMountedRef.current = true

    return () => {
      navbarMountedRef.current = false
      clearPendingUserMenuFocusFrames()
    }
  }, [clearPendingUserMenuFocusFrames])

  const scheduleUserMenuTriggerFocus = useCallback((focusTrigger: () => void) => {
    clearPendingUserMenuFocusFrames()
    if (typeof window === "undefined") {
      if (navbarMountedRef.current) {
        focusTrigger()
      }
      return
    }

    const frameHandle = window.requestAnimationFrame(() => {
      pendingFocusFramesRef.current = pendingFocusFramesRef.current.filter(
        (pendingFrameHandle) => pendingFrameHandle !== frameHandle
      )
      if (!navbarMountedRef.current) {
        return
      }
      focusTrigger()
    })
    pendingFocusFramesRef.current.push(frameHandle)
  }, [clearPendingUserMenuFocusFrames])

  const focusDesktopUserMenuTrigger = useCallback(() => {
    desktopUserMenuTriggerRef.current?.focus({ preventScroll: true })
    scheduleUserMenuTriggerFocus(() => {
      desktopUserMenuTriggerRef.current?.focus({ preventScroll: true })
    })
  }, [scheduleUserMenuTriggerFocus])

  const focusMobileUserMenuTrigger = useCallback(() => {
    mobileUserMenuTriggerRef.current?.focus({ preventScroll: true })
    scheduleUserMenuTriggerFocus(() => {
      mobileUserMenuTriggerRef.current?.focus({ preventScroll: true })
    })
  }, [scheduleUserMenuTriggerFocus])

  const scheduleDesktopUserMenuTriggerFocus = useCallback(() => {
    scheduleUserMenuTriggerFocus(() => {
      desktopUserMenuTriggerRef.current?.focus({ preventScroll: true })
    })
  }, [scheduleUserMenuTriggerFocus])

  const scheduleMobileUserMenuTriggerFocus = useCallback(() => {
    scheduleUserMenuTriggerFocus(() => {
      mobileUserMenuTriggerRef.current?.focus({ preventScroll: true })
    })
  }, [scheduleUserMenuTriggerFocus])

  const restoreDesktopUserMenuFocus = useCallback((event: Event) => {
    event.preventDefault()
    focusDesktopUserMenuTrigger()
  }, [focusDesktopUserMenuTrigger])

  const restoreMobileUserMenuFocus = useCallback((event: Event) => {
    event.preventDefault()
    focusMobileUserMenuTrigger()
  }, [focusMobileUserMenuTrigger])

  const restoreMobileNavigationFocus = useCallback((event: Event) => {
    event.preventDefault()
    if (window.matchMedia("(min-width: 1024px)").matches) {
      desktopNavigationTriggerRef.current?.focus({ preventScroll: true })
    } else {
      mobileNavigationTriggerRef.current?.focus({ preventScroll: true })
    }
  }, [])

  const navigateToItem = useCallback(
    (itemId: string) => {
      onNavigate(resolveNavigationTarget(itemId))
    },
    [onNavigate]
  )
  const prefetchItem = useCallback((itemId: string) => {
    void prefetchNavigationTargetWithDiagnostics(resolveNavigationTarget(itemId), {
      source: "navbar",
      itemId,
    })
  }, [])

  const activeItem = mobileItems.find((item) => item.id === activeNavigationItemId)
  const activeContext = activeItem?.title || activeItem?.label || systemName || "SQR Workspace"

  return (
    <>
      <aside className="workspace-sidebar" aria-label="Ruang kerja">
          <NavbarBrandCluster
            activeNavigationItemId={activeNavigationItemId}
            showHomeButton={showHomeButton}
            systemName={systemName}
            onNavigate={navigateToItem}
            onPrefetch={prefetchItem}
            collapsed={sidebarCollapsed}
          />
          <NavbarDesktopNavigation
            directItems={directItems}
            groupedItems={groupedItems}
            activeNavigationItemId={activeNavigationItemId}
            savedCount={savedCount}
            onNavigate={navigateToItem}
            onPrefetch={prefetchItem}
            collapsed={sidebarCollapsed}
          />
          <div className="workspace-sidebar-footer">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  ref={desktopNavigationTriggerRef}
                  type="button"
                  className="workspace-sidebar-toggle"
                  aria-label={sidebarCollapsed ? "Kembangkan navigasi" : "Kecilkan navigasi"}
                  {...getAriaExpandedProps(!sidebarCollapsed)}
                  onClick={() => onSidebarCollapsedChange?.(!sidebarCollapsed)}
                  data-testid="button-toggle-sidebar"
                >
                  {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" aria-hidden="true" /> : <PanelLeftClose className="h-4 w-4" aria-hidden="true" />}
                  <span className="workspace-sidebar-copy">Kecilkan navigasi</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{sidebarCollapsed ? "Kembangkan navigasi" : "Kecilkan navigasi"}</TooltipContent>
            </Tooltip>
          </div>
      </aside>
      <header className="navbar-safe-area-shell workspace-topbar">
        <div className="workspace-topbar-inner">
          <div className="workspace-mobile-context">
            <button
              ref={mobileNavigationTriggerRef}
              type="button"
              className="nav-mobile-trigger"
              aria-label={translate("common.navbar.mobileMenuLabel")}
              aria-haspopup="dialog"
              aria-controls="mobile-navigation-drawer"
              {...mobileNavTriggerExpandedProps}
              onClick={() => setMobileNavOpen(true)}
              data-testid="button-open-mobile-nav"
            >
              <Menu className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">{translate("common.navbar.mobileMenuText")}</span>
            </button>
            <span className="workspace-context-current" title={activeContext}>{activeContext}</span>
          </div>

          <div className="workspace-desktop-context">
            <span className="workspace-context-parent">Ruang kerja</span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="workspace-context-current" title={activeContext}>{activeContext}</span>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1 lg:hidden">

            <NavbarNotificationCenter
              {...notificationHistory}
              variant="mobile"
              onClear={clearNotificationHistory}
              onDismissEntry={removeNotificationHistoryEntry}
              onMarkRead={markNotificationHistoryRead}
            />

            <NavbarUserMenuDropdown
              variant="mobile"
              triggerRef={mobileUserMenuTriggerRef}
              username={username}
              userRole={userRole}
              theme={theme}
              setTheme={setTheme}
              onLogout={onLogout}
              onCloseAutoFocus={restoreMobileUserMenuFocus}
              onEscapeKeyDown={scheduleMobileUserMenuTriggerFocus}
            />
          </div>
        <div className="ml-auto hidden shrink-0 items-center gap-2 lg:flex">
          <NavbarNotificationCenter
            {...notificationHistory}
            variant="desktop"
            onClear={clearNotificationHistory}
            onDismissEntry={removeNotificationHistoryEntry}
            onMarkRead={markNotificationHistoryRead}
          />

          <NavbarUserMenuDropdown
            variant="desktop"
            triggerRef={desktopUserMenuTriggerRef}
            username={username}
            userRole={userRole}
            theme={theme}
            setTheme={setTheme}
            onLogout={onLogout}
            onCloseAutoFocus={restoreDesktopUserMenuFocus}
            onEscapeKeyDown={scheduleDesktopUserMenuTriggerFocus}
          />
        </div>
      </div>

      <NavbarMobileNavigation
        onCloseAutoFocus={restoreMobileNavigationFocus}
        open={mobileNavOpen}
        onOpenChange={setMobileNavOpen}
        mobileItems={mobileItems}
        activeMobileItemId={activeMobileItemId}
        savedCount={savedCount}
        onNavigate={navigateToItem}
        onPrefetch={prefetchItem}
      />
    </header>
    </>
  )
}

export default memo(NavbarImpl)

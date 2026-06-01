import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Menu } from "lucide-react"
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
import { NavbarBrandCluster, NavbarUserMenuDropdown } from "@/components/NavbarParts"
import {
  buildDesktopNavLayoutKey,
  resolveNavbarActiveMobileItemId,
  resolveNavbarShowHomeButton,
} from "@/components/navbar-utils"
import { useTheme } from "@/components/useTheme"
import { useDesktopNavOverflowState } from "@/components/useDesktopNavOverflowState"
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
}: NavbarProps) {
  const { theme, setTheme } = useTheme()
  const [routerLocation] = useLocation()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const navScrollerRef = useRef<HTMLDivElement>(null)
  const desktopUserMenuTriggerRef = useRef<HTMLButtonElement>(null)
  const mobileUserMenuTriggerRef = useRef<HTMLButtonElement>(null)
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
  const mobileNavTriggerExpandedProps = {
    "aria-expanded": mobileNavOpen,
  } as const

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

  const desktopNavLayoutKey = useMemo(
    () => buildDesktopNavLayoutKey(directItems, groupedItems, savedCount, showHomeButton),
    [directItems, groupedItems, savedCount, showHomeButton]
  )
  const desktopNavOverflow = useDesktopNavOverflowState(navScrollerRef, desktopNavLayoutKey)

  return (
    <header className="navbar-safe-area-shell sticky top-0 z-[var(--z-navbar)] w-full border-b border-border/70 bg-background/95 supports-[backdrop-filter]:bg-background/90 supports-[backdrop-filter]:backdrop-blur-md">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-3 py-2 md:px-4 lg:min-h-16 lg:flex-row lg:items-center">
        <div className="flex min-w-0 items-start justify-between gap-3 lg:flex-[0_1_auto] lg:items-center lg:pr-2">
          <NavbarBrandCluster
            activeNavigationItemId={activeNavigationItemId}
            showHomeButton={showHomeButton}
            systemName={systemName}
            onNavigate={navigateToItem}
            onPrefetch={prefetchItem}
          />

          <div className="flex shrink-0 items-center gap-2 lg:hidden">
            <button
              type="button"
              className="nav-mobile-trigger px-3"
              aria-label="Buka menu navigasi"
              aria-haspopup="dialog"
              aria-controls="mobile-navigation-drawer"
              {...mobileNavTriggerExpandedProps}
              onClick={() => setMobileNavOpen(true)}
              data-testid="button-open-mobile-nav"
            >
              <Menu className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Menu</span>
            </button>

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
        </div>

        <NavbarDesktopNavigation
          directItems={directItems}
          groupedItems={groupedItems}
          activeNavigationItemId={activeNavigationItemId}
          savedCount={savedCount}
          onNavigate={navigateToItem}
          onPrefetch={prefetchItem}
          navScrollerRef={navScrollerRef}
          desktopNavOverflow={desktopNavOverflow}
        />

        <div className="ml-auto hidden shrink-0 items-center gap-2 lg:flex">
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
        open={mobileNavOpen}
        onOpenChange={setMobileNavOpen}
        mobileItems={mobileItems}
        activeMobileItemId={activeMobileItemId}
        savedCount={savedCount}
        onNavigate={navigateToItem}
        onPrefetch={prefetchItem}
      />
    </header>
  )
}

export default memo(NavbarImpl)

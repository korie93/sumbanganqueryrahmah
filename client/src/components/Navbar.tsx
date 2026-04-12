import { memo, useCallback, useMemo, useRef, useState } from "react"
import { ChevronDown, Menu } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  getVisibleNavItems,
  getVisibleNavigationGroups,
  getVisiblePrimaryNavItems,
  HOME_NAV_ITEM,
  resolveNavigationTarget,
  resolveActiveNavigationItemId,
} from "@/app/navigation"
import { prefetchNavigationTarget } from "@/app/navigation-prefetch"
import type { MonitorSection, TabVisibility } from "@/app/types"
import { BrandLogo } from "@/components/BrandLogo"
import { NavbarDesktopNavigation } from "@/components/NavbarDesktopNavigation"
import { NavbarHomeButton } from "@/components/NavbarHomeButton"
import { NavbarMobileNavigation } from "@/components/NavbarMobileNavigation"
import { NavbarUserMenuContent } from "@/components/NavbarUserMenuContent"
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const navScrollerRef = useRef<HTMLElement | null>(null)

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
  const activeNavigationItemId = useMemo(
    () =>
      resolveActiveNavigationItemId(currentPage, {
        monitorSection,
        pathname: typeof window !== "undefined" ? window.location.pathname : "",
        search: typeof window !== "undefined" ? window.location.search : "",
      }),
    [currentPage, monitorSection]
  )
  const activeMobileItemId = useMemo(
    () => resolveNavbarActiveMobileItemId(mobileItems, activeNavigationItemId),
    [activeNavigationItemId, mobileItems]
  )

  const navigateToItem = useCallback(
    (itemId: string) => {
      onNavigate(resolveNavigationTarget(itemId))
    },
    [onNavigate]
  )
  const prefetchItem = useCallback((itemId: string) => {
    void prefetchNavigationTarget(resolveNavigationTarget(itemId))
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
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex min-w-0 items-center gap-2 rounded-full border border-border/70 bg-card/75 px-2.5 py-1.5 shadow-sm lg:max-w-[17rem] xl:max-w-none">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/10">
                <BrandLogo
                  decorative
                  priority
                  className="block h-5 w-5"
                  imageClassName="h-full w-full"
                />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {systemName || "SQR System"}
                </p>
                <p className="hidden text-[11px] text-muted-foreground sm:block">
                  Operational workspace
                </p>
              </div>
            </div>

            {showHomeButton ? (
              <NavbarHomeButton
                active={activeNavigationItemId === HOME_NAV_ITEM.id}
                onNavigate={navigateToItem}
                onPrefetch={prefetchItem}
              />
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2 lg:hidden">
            <button
              type="button"
              className="nav-mobile-trigger px-3"
              aria-label="Open navigation menu"
              aria-haspopup="dialog"
              aria-controls="mobile-navigation-drawer"
              onClick={() => setMobileNavOpen(true)}
              data-testid="button-open-mobile-nav"
            >
              <Menu className="h-4 w-4" />
              <span className="hidden sm:inline">Menu</span>
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="user-menu-trigger px-2.5 sm:px-3"
                  data-testid="button-user-menu-mobile"
                  aria-label="Open user menu"
                  aria-haspopup="menu"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold uppercase text-primary">
                    {username.slice(0, 1)}
                  </span>
                  <span className="hidden min-w-0 sm:flex sm:flex-col sm:items-start sm:leading-tight">
                    <span className="truncate text-xs font-medium text-foreground">
                      {username}
                    </span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {userRole}
                    </span>
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <NavbarUserMenuContent
                username={username}
                userRole={userRole}
                theme={theme}
                setTheme={setTheme}
                onLogout={onLogout}
              />
            </DropdownMenu>
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="user-menu-trigger max-w-[15rem] xl:max-w-none"
                data-testid="button-user-menu"
                aria-label="Open user menu"
                aria-haspopup="menu"
              >
                <span className="user-menu-copy max-w-[10.5rem] xl:max-w-none">
                  <span className="truncate font-medium text-foreground">{username}</span>
                  <span className="user-menu-role">{userRole}</span>
                </span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <NavbarUserMenuContent
              username={username}
              userRole={userRole}
              theme={theme}
              setTheme={setTheme}
              onLogout={onLogout}
            />
          </DropdownMenu>
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

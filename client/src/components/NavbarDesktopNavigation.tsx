import { memo, type RefObject } from "react"
import { ChevronDown } from "lucide-react"

import type {
  NavigationEntry,
  NavigationGroup,
} from "@/app/navigation"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { formatSavedCountBadge } from "@/components/navbar-utils"
import type { DesktopNavOverflowState } from "@/components/useDesktopNavOverflowState"

type NavbarDesktopNavigationProps = {
  directItems: NavigationEntry[]
  groupedItems: NavigationGroup[]
  activeNavigationItemId: string
  savedCount?: number | undefined
  onNavigate: (itemId: string) => void
  onPrefetch: (itemId: string) => void
  navScrollerRef: RefObject<HTMLElement | null>
  desktopNavOverflow: DesktopNavOverflowState
}

function NavbarDesktopNavigationImpl({
  directItems,
  groupedItems,
  activeNavigationItemId,
  savedCount,
  onNavigate,
  onPrefetch,
  navScrollerRef,
  desktopNavOverflow,
}: NavbarDesktopNavigationProps) {
  return (
    <div className="navbar-nav-shell hidden min-w-0 flex-1 items-center justify-start overflow-hidden lg:flex">
      <nav
        ref={navScrollerRef as RefObject<HTMLElement>}
        className="navbar-premium-glass w-full justify-start"
        aria-label="Primary navigation"
      >
        {directItems.map((item) => {
          const Icon = item.icon
          const isActive = activeNavigationItemId === item.id
          const savedBadge = item.id === "saved" ? formatSavedCountBadge(savedCount) : null

          return (
            <button
              key={item.id}
              type="button"
              title={item.label}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              onClick={() => onNavigate(item.id)}
              onMouseEnter={() => onPrefetch(item.id)}
              onFocus={() => onPrefetch(item.id)}
              data-testid={`nav-${item.id}`}
              className={`nav-pill${isActive ? " nav-pill-active" : ""}`}
            >
              <span className="nav-pill-icon">
                <Icon className="h-4 w-4" />
              </span>
              <span className="nav-pill-label">{item.label}</span>
              {savedBadge ? (
                <span
                  className="rounded-full bg-primary px-1.5 py-0.5 text-xs font-medium text-primary-foreground"
                  data-testid="badge-saved-count"
                >
                  {savedBadge}
                </span>
              ) : null}
            </button>
          )
        })}

        {groupedItems.map((group) => {
          const GroupIcon = group.icon
          const active = group.items.some((item) => item.id === activeNavigationItemId)

          return (
            <DropdownMenu key={group.id}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  title={group.label}
                  aria-label={`${group.label} menu`}
                  onMouseEnter={() => group.items.forEach((item) => onPrefetch(item.id))}
                  onFocus={() => group.items.forEach((item) => onPrefetch(item.id))}
                  className={`nav-pill${active ? " nav-pill-active" : ""}`}
                  data-testid={`nav-group-${group.id}`}
                >
                  <span className="nav-pill-icon">
                    <GroupIcon className="h-4 w-4" />
                  </span>
                  <span className="nav-pill-label">{group.label}</span>
                  <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-80 p-2">
                <DropdownMenuLabel className="px-2 pb-2 pt-1">
                  <div className="text-sm font-semibold">{group.label}</div>
                  <div className="mt-1 text-xs font-normal text-muted-foreground">
                    {group.description}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuGroup>
                  {group.items.map((item) => {
                    const Icon = item.icon
                    const activeItem = activeNavigationItemId === item.id

                    return (
                      <DropdownMenuItem
                        key={item.id}
                        onSelect={() => onNavigate(item.id)}
                        onFocus={() => onPrefetch(item.id)}
                        className={`items-start gap-3 rounded-xl px-3 py-3 ${activeItem ? "bg-accent text-accent-foreground" : ""}`}
                      >
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 space-y-0.5">
                          <span className="block text-sm font-medium leading-none">{item.label}</span>
                          {item.description ? (
                            <span className="block text-xs leading-relaxed text-muted-foreground">
                              {item.description}
                            </span>
                          ) : null}
                        </span>
                      </DropdownMenuItem>
                    )
                  })}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        })}
      </nav>
      {desktopNavOverflow.canScroll ? (
        <>
          <div
            className={cn(
              "navbar-scroll-fade navbar-scroll-fade--left",
              desktopNavOverflow.canScrollLeft ? "navbar-scroll-fade--visible" : ""
            )}
            aria-hidden="true"
          />
          <div
            className={cn(
              "navbar-scroll-fade navbar-scroll-fade--right",
              desktopNavOverflow.canScrollRight ? "navbar-scroll-fade--visible" : ""
            )}
            aria-hidden="true"
          />
          {desktopNavOverflow.canScrollRight ? (
            <div className="navbar-scroll-hint" aria-hidden="true">
              Scroll for more
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

export const NavbarDesktopNavigation = memo(NavbarDesktopNavigationImpl)

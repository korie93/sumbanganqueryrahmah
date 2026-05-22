import { memo, type KeyboardEvent, type RefObject, useRef } from "react"
import { ChevronDown } from "lucide-react"

import type {
  NavigationEntry,
  NavigationGroup,
} from "@/app/navigation"
import { cn } from "@/lib/utils"
import {
  getNavbarKeyboardScrollLeftDelta,
  resolveNavbarScrollBehavior,
} from "@/components/navbar-scroll-utils"
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
  navScrollerRef: RefObject<HTMLDivElement>
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
  const groupTriggerRefs = useRef(new Map<string, HTMLButtonElement>())

  const restoreGroupTriggerFocus = (groupId: string) => {
    groupTriggerRefs.current.get(groupId)?.focus({ preventScroll: true })
    globalThis.setTimeout(() => {
      groupTriggerRefs.current.get(groupId)?.focus({ preventScroll: true })
    }, 0)
  }

  const getScrollBehavior = () => resolveNavbarScrollBehavior(
    typeof window !== "undefined"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )

  const handleNavScrollerKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const navNode = event.currentTarget
    const behavior = getScrollBehavior()

    if (event.key === "Home") {
      event.preventDefault()
      navNode.scrollTo({ left: 0, behavior })
      return
    }

    if (event.key === "End") {
      event.preventDefault()
      navNode.scrollTo({ left: navNode.scrollWidth, behavior })
      return
    }

    const leftDelta = getNavbarKeyboardScrollLeftDelta(event.key, navNode.clientWidth)

    if (leftDelta === 0) {
      return
    }

    event.preventDefault()
    navNode.scrollBy({ left: leftDelta, behavior })
  }

  return (
    <div className="navbar-nav-shell hidden min-w-0 flex-1 items-center justify-start overflow-hidden lg:flex">
      <nav aria-label="Navigasi utama" className="w-full min-w-0">
        <div
          ref={navScrollerRef}
          className="navbar-premium-glass w-full justify-start"
          role="toolbar"
          aria-label="Pintasan navigasi utama"
          onKeyDown={handleNavScrollerKeyDown}
          tabIndex={desktopNavOverflow.canScroll ? 0 : undefined}
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
                <Icon className="h-4 w-4" aria-hidden="true" />
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
                  ref={(node) => {
                    if (node) {
                      groupTriggerRefs.current.set(group.id, node)
                    } else {
                      groupTriggerRefs.current.delete(group.id)
                    }
                  }}
                  type="button"
                  title={group.label}
                  aria-label={`Menu ${group.label}`}
                  aria-current={active ? "page" : undefined}
                  onMouseEnter={() => group.items.forEach((item) => onPrefetch(item.id))}
                  onFocus={() => group.items.forEach((item) => onPrefetch(item.id))}
                  className={`nav-pill${active ? " nav-pill-active" : ""}`}
                  data-testid={`nav-group-${group.id}`}
                >
                  <span className="nav-pill-icon">
                    <GroupIcon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="nav-pill-label">{group.label}</span>
                  <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="center"
                sideOffset={8}
                className="w-[22rem] rounded-2xl border-border/70 p-2 shadow-xl"
                onEscapeKeyDown={() => {
                  restoreGroupTriggerFocus(group.id)
                }}
                onCloseAutoFocus={(event) => {
                  event.preventDefault()
                  restoreGroupTriggerFocus(group.id)
                }}
              >
                <DropdownMenuLabel className="rounded-xl bg-muted/20 px-3 py-2.5">
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
                        aria-current={activeItem ? "page" : undefined}
                        onSelect={() => onNavigate(item.id)}
                        onFocus={() => onPrefetch(item.id)}
                        className={`items-start gap-3 rounded-xl px-3 py-3 ${activeItem ? "bg-primary/10 text-primary focus:bg-primary/10 focus:text-primary" : ""}`}
                      >
                        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${activeItem ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}>
                          <Icon className="h-4 w-4" aria-hidden="true" />
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
        </div>
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
              Tatal untuk lagi
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

export const NavbarDesktopNavigation = memo(NavbarDesktopNavigationImpl)

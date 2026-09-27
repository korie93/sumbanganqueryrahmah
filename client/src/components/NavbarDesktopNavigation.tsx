import { memo, useCallback, useEffect, useRef } from "react"
import { ChevronDown } from "lucide-react"

import type {
  NavigationEntry,
  NavigationGroup,
} from "@/app/navigation"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { formatSavedCountBadge } from "@/components/navbar-utils"
import { getAriaCurrentPageProps } from "@/lib/aria-state-props"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

type NavbarDesktopNavigationProps = {
  directItems: NavigationEntry[]
  groupedItems: NavigationGroup[]
  activeNavigationItemId: string
  savedCount?: number | undefined
  onNavigate: (itemId: string) => void
  onPrefetch: (itemId: string) => void
  collapsed?: boolean | undefined
}

function NavbarDesktopNavigationImpl({
  directItems,
  groupedItems,
  activeNavigationItemId,
  savedCount,
  onNavigate,
  onPrefetch,
  collapsed = false,
}: NavbarDesktopNavigationProps) {
  const groupTriggerRefs = useRef(new Map<string, HTMLButtonElement>())
  const navMountedRef = useRef(true)
  const pendingGroupFocusFramesRef = useRef<number[]>([])

  const clearPendingGroupTriggerFocusFrames = useCallback(() => {
    if (typeof window !== "undefined") {
      for (const frameHandle of pendingGroupFocusFramesRef.current) {
        window.cancelAnimationFrame(frameHandle)
      }
    }
    pendingGroupFocusFramesRef.current = []
  }, [])

  useEffect(() => {
    navMountedRef.current = true

    return () => {
      navMountedRef.current = false
      clearPendingGroupTriggerFocusFrames()
    }
  }, [clearPendingGroupTriggerFocusFrames])

  const scheduleGroupTriggerFocus = useCallback((groupId: string) => {
    clearPendingGroupTriggerFocusFrames()
    if (typeof window === "undefined") {
      if (navMountedRef.current) {
        groupTriggerRefs.current.get(groupId)?.focus({ preventScroll: true })
      }
      return
    }

    const frameHandle = window.requestAnimationFrame(() => {
      pendingGroupFocusFramesRef.current = pendingGroupFocusFramesRef.current.filter(
        (pendingFrameHandle) => pendingFrameHandle !== frameHandle
      )
      if (!navMountedRef.current) {
        return
      }
      groupTriggerRefs.current.get(groupId)?.focus({ preventScroll: true })
    })
    pendingGroupFocusFramesRef.current.push(frameHandle)
  }, [clearPendingGroupTriggerFocusFrames])

  const restoreGroupTriggerFocus = useCallback((groupId: string) => {
    groupTriggerRefs.current.get(groupId)?.focus({ preventScroll: true })
    scheduleGroupTriggerFocus(groupId)
  }, [scheduleGroupTriggerFocus])

  return (
    <div className="navbar-nav-shell hidden min-w-0 flex-1 lg:flex">
      <nav aria-label="Navigasi utama" className="w-full min-w-0">
        <div className="navbar-premium-glass">
        {directItems.map((item) => {
          const Icon = item.icon
          const isActive = activeNavigationItemId === item.id
          const savedBadge = item.id === "saved" ? formatSavedCountBadge(savedCount) : null

          return (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={item.label}
                  {...getAriaCurrentPageProps(isActive)}
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
              </TooltipTrigger>
              {collapsed ? <TooltipContent side="right">{item.label}</TooltipContent> : null}
            </Tooltip>
          )
        })}

        {groupedItems.map((group) => {
          const GroupIcon = group.icon
          const active = group.items.some((item) => item.id === activeNavigationItemId)

          return (
            <DropdownMenu key={group.id}>
              <Tooltip>
                <TooltipTrigger asChild>
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
                      aria-label={`Menu ${group.label}`}
                      {...getAriaCurrentPageProps(active)}
                      onMouseEnter={() => group.items.forEach((item) => onPrefetch(item.id))}
                      onFocus={() => group.items.forEach((item) => onPrefetch(item.id))}
                      className={`nav-pill${active ? " nav-pill-active" : ""}`}
                      data-testid={`nav-group-${group.id}`}
                    >
                      <span className="nav-pill-icon">
                        <GroupIcon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="nav-pill-label">{group.label}</span>
                      <ChevronDown className="nav-group-chevron h-3.5 w-3.5 opacity-70" aria-hidden="true" />
                    </button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                {collapsed ? <TooltipContent side="right">{group.label}</TooltipContent> : null}
              </Tooltip>
              <DropdownMenuContent
                side="right"
                align="start"
                sideOffset={8}
                className="navbar-dropdown-content w-[20rem] rounded-lg border-border p-1 shadow-md"
                onEscapeKeyDown={() => {
                  scheduleGroupTriggerFocus(group.id)
                }}
                onCloseAutoFocus={(event) => {
                  event.preventDefault()
                  restoreGroupTriggerFocus(group.id)
                }}
              >
                <DropdownMenuLabel className="px-3 py-2.5">
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
                        {...getAriaCurrentPageProps(activeItem)}
                        onSelect={() => onNavigate(item.id)}
                        onFocus={() => onPrefetch(item.id)}
                        className={`items-start gap-3 rounded-md px-3 py-2.5 ${activeItem ? "bg-primary/10 text-primary focus:bg-primary/10 focus:text-primary" : ""}`}
                      >
                        <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${activeItem ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
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
    </div>
  )
}

/**
 * Renders the shared navbar desktop navigation component used across SQR screens.
 */
export const NavbarDesktopNavigation = memo(NavbarDesktopNavigationImpl)

import { memo } from "react"

import { formatNavigationLabel, type NavigationEntry } from "@/app/navigation"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { getAriaCurrentPageProps } from "@/lib/aria-state-props"

type NavbarMobileNavigationProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCloseAutoFocus: (event: Event) => void
  mobileItems: NavigationEntry[]
  activeMobileItemId: string
  savedCount?: number | undefined
  onNavigate: (itemId: string) => void
  onPrefetch: (itemId: string) => void
}

function NavbarMobileNavigationImpl({
  open,
  onOpenChange,
  onCloseAutoFocus,
  mobileItems,
  activeMobileItemId,
  savedCount,
  onNavigate,
  onPrefetch,
}: NavbarMobileNavigationProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        onCloseAutoFocus={onCloseAutoFocus}
        id="mobile-navigation-drawer"
        side="left"
        className="workspace-mobile-navigation w-[min(92vw,20rem)]"
      >
        <SheetHeader className="pr-8 text-left">
          <SheetTitle>Navigasi</SheetTitle>
          <SheetDescription>
            Bahagian semasa: {formatNavigationLabel(
              mobileItems.find((item) => item.id === activeMobileItemId)?.label || "Utama",
              activeMobileItemId,
              savedCount
            )}
          </SheetDescription>
        </SheetHeader>

        <nav className="mt-5 space-y-1" aria-label="Navigasi mudah alih">
          {mobileItems.map((item) => {
            const Icon = item.icon
            const active = item.id === activeMobileItemId

            return (
              <button
                key={item.id}
                type="button"
                {...getAriaCurrentPageProps(active)}
                onClick={() => {
                  onNavigate(item.id)
                  onOpenChange(false)
                }}
                onMouseEnter={() => onPrefetch(item.id)}
                onFocus={() => onPrefetch(item.id)}
                className={`flex min-h-11 w-full items-start gap-3 rounded-md border border-transparent px-3 py-2.5 text-left transition-colors ${
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-foreground hover:bg-accent"
                }`}
              >
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center ${active ? "text-primary" : "text-muted-foreground"}`}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="block truncate text-sm font-medium">
                      {formatNavigationLabel(item.label, item.id, savedCount)}
                    </span>
                    {active ? (
                      <span className="shrink-0 rounded-sm bg-primary px-1.5 py-0.5 text-xs font-medium text-primary-foreground">
                        Semasa
                      </span>
                    ) : null}
                  </span>
                  {item.description ? (
                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                      {item.description}
                    </span>
                  ) : null}
                </span>
              </button>
            )
          })}
        </nav>
      </SheetContent>
    </Sheet>
  )
}

/**
 * Renders the shared navbar mobile navigation component used across SQR screens.
 */
export const NavbarMobileNavigation = memo(NavbarMobileNavigationImpl)

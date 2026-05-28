import { memo } from "react"

import { formatNavigationLabel, type NavigationEntry } from "@/app/navigation"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

type NavbarMobileNavigationProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mobileItems: NavigationEntry[]
  activeMobileItemId: string
  savedCount?: number | undefined
  onNavigate: (itemId: string) => void
  onPrefetch: (itemId: string) => void
}

function NavbarMobileNavigationImpl({
  open,
  onOpenChange,
  mobileItems,
  activeMobileItemId,
  savedCount,
  onNavigate,
  onPrefetch,
}: NavbarMobileNavigationProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        id="mobile-navigation-drawer"
        side="left"
        className="w-[min(92vw,22rem)]"
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

        <nav className="mt-4 space-y-2" aria-label="Navigasi mudah alih">
          {mobileItems.map((item) => {
            const Icon = item.icon
            const active = item.id === activeMobileItemId

            return (
              <button
                key={item.id}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => {
                  onNavigate(item.id)
                  onOpenChange(false)
                }}
                onMouseEnter={() => onPrefetch(item.id)}
                onFocus={() => onPrefetch(item.id)}
                className={`flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
                  active
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border/60 bg-background/70 text-foreground hover:border-border hover:bg-accent/40"
                }`}
              >
                <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${active ? "bg-primary-foreground text-primary" : "bg-primary/10 text-primary"}`}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="block truncate text-sm font-medium">
                      {formatNavigationLabel(item.label, item.id, savedCount)}
                    </span>
                    {active ? (
                      <span className="shrink-0 rounded-full bg-primary-foreground px-2 py-0.5 text-xxs font-semibold uppercase tracking-label-xs text-primary">
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

export const NavbarMobileNavigation = memo(NavbarMobileNavigationImpl)

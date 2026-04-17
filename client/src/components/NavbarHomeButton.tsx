import { memo } from "react"
import { Home } from "lucide-react"

import { HOME_NAV_ITEM } from "@/app/navigation"

type NavbarHomeButtonProps = {
  active: boolean
  onNavigate: (itemId: string) => void
  onPrefetch: (itemId: string) => void
}

function NavbarHomeButtonImpl({
  active,
  onNavigate,
  onPrefetch,
}: NavbarHomeButtonProps) {
  return (
    <button
      type="button"
      onClick={() => onNavigate(HOME_NAV_ITEM.id)}
      onMouseEnter={() => onPrefetch(HOME_NAV_ITEM.id)}
      onFocus={() => onPrefetch(HOME_NAV_ITEM.id)}
      className={`nav-pill nav-home-pill hidden lg:inline-flex${active ? " nav-pill-active" : ""}`}
      data-testid="nav-home"
      aria-label={HOME_NAV_ITEM.label}
      aria-current={active ? "page" : undefined}
    >
      <span className="nav-pill-icon">
        <Home className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="nav-pill-label">Home</span>
    </button>
  )
}

export const NavbarHomeButton = memo(NavbarHomeButtonImpl)

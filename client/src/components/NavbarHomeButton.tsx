import { memo } from "react"
import { Home } from "lucide-react"

import { HOME_NAV_ITEM } from "@/app/navigation"
import { getAriaCurrentPageProps } from "@/lib/aria-state-props"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

type NavbarHomeButtonProps = {
  active: boolean
  onNavigate: (itemId: string) => void
  onPrefetch: (itemId: string) => void
  collapsed?: boolean | undefined
}

function NavbarHomeButtonImpl({
  active,
  onNavigate,
  onPrefetch,
  collapsed = false,
}: NavbarHomeButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => onNavigate(HOME_NAV_ITEM.id)}
          onMouseEnter={() => onPrefetch(HOME_NAV_ITEM.id)}
          onFocus={() => onPrefetch(HOME_NAV_ITEM.id)}
          className={`nav-pill nav-home-pill !hidden lg:!inline-flex${active ? " nav-pill-active" : ""}`}
          data-testid="nav-home"
          aria-label="Home"
          {...getAriaCurrentPageProps(active)}
        >
          <span className="nav-pill-icon">
            <Home className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="nav-pill-label">Home</span>
        </button>
      </TooltipTrigger>
      {collapsed ? <TooltipContent side="right">Home</TooltipContent> : null}
    </Tooltip>
  )
}

/**
 * Renders the shared navbar home button component used across SQR screens.
 */
export const NavbarHomeButton = memo(NavbarHomeButtonImpl)

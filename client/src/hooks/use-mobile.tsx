import * as React from "react"
import { MOBILE_MEDIA_QUERY, isMobileViewportWidth } from "@/lib/responsive"

type MobileViewportWindow = Pick<Window, "innerWidth" | "matchMedia">

function isMediaQueryListLike(value: unknown): value is Pick<MediaQueryList, "matches"> {
  return typeof value === "object" && value !== null && "matches" in value
}

export function resolveIsMobileViewport(viewportWindow?: MobileViewportWindow): boolean {
  if (!viewportWindow) {
    return false
  }

  if (typeof viewportWindow.matchMedia === "function") {
    try {
      const mediaQueryList = viewportWindow.matchMedia(MOBILE_MEDIA_QUERY)
      if (isMediaQueryListLike(mediaQueryList)) {
        return mediaQueryList.matches
      }
    } catch {
      // Fall back to viewport width checks when matchMedia is unavailable or throws.
    }
  }

  return isMobileViewportWidth(viewportWindow.innerWidth)
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(() =>
    resolveIsMobileViewport(typeof window === "undefined" ? undefined : window)
  )

  React.useEffect(() => {
    const mql = window.matchMedia(MOBILE_MEDIA_QUERY)
    const onChange = () => {
      setIsMobile(resolveIsMobileViewport(window))
    }

    onChange()

    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    }

    mql.addListener(onChange)
    return () => mql.removeListener(onChange)
  }, [])

  return isMobile
}

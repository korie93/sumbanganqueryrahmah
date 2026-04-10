import * as React from "react"
import { MOBILE_MEDIA_QUERY, isMobileViewportWidth } from "@/lib/responsive"

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(MOBILE_MEDIA_QUERY)
    const onChange = () => {
      setIsMobile(isMobileViewportWidth(window.innerWidth))
    }
    mql.addEventListener("change", onChange)
    setIsMobile(isMobileViewportWidth(window.innerWidth))
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}

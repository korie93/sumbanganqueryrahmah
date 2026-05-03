const SIDEBAR_COOKIE_NAME = "sidebar_state"
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7

type BuildSidebarStateCookieOptions = {
  protocol?: string | null
}

export function buildSidebarStateCookie(
  openState: boolean,
  options: BuildSidebarStateCookieOptions = {},
) {
  const secureAttribute = options.protocol === "https:" ? "; Secure" : ""
  return `${SIDEBAR_COOKIE_NAME}=${encodeURIComponent(String(openState))}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; SameSite=Lax${secureAttribute}`
}

export {
  SIDEBAR_COOKIE_MAX_AGE,
  SIDEBAR_COOKIE_NAME,
}

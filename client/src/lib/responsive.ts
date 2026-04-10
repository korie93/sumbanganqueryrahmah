export const RESPONSIVE_BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
} as const;

export const RESPONSIVE_MAX_WIDTHS = {
  mobile: RESPONSIVE_BREAKPOINTS.md - 1,
  tablet: RESPONSIVE_BREAKPOINTS.lg - 1,
} as const;

export const SMALL_HANDSET_MEDIA_QUERY = `(max-width: ${RESPONSIVE_BREAKPOINTS.sm}px)`;
export const MOBILE_MEDIA_QUERY = `(max-width: ${RESPONSIVE_MAX_WIDTHS.mobile}px)`;
export const TABLET_MEDIA_QUERY = `(max-width: ${RESPONSIVE_MAX_WIDTHS.tablet}px)`;
export const SMALL_UP_MEDIA_QUERY = `(min-width: ${RESPONSIVE_BREAKPOINTS.sm}px)`;
export const MEDIUM_UP_MEDIA_QUERY = `(min-width: ${RESPONSIVE_BREAKPOINTS.md}px)`;
export const LARGE_UP_MEDIA_QUERY = `(min-width: ${RESPONSIVE_BREAKPOINTS.lg}px)`;

export function isMobileViewportWidth(width: number | null | undefined): boolean {
  return typeof width === "number" && width < RESPONSIVE_BREAKPOINTS.md;
}

export function isTabletOrSmallerViewportWidth(width: number | null | undefined): boolean {
  return typeof width === "number" && width <= RESPONSIVE_MAX_WIDTHS.tablet;
}

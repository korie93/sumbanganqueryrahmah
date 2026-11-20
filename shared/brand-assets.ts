/** Approved SQR brand assets. Paths are public, same-origin, and build-independent. */
const transparentQ = "/brand/sidebar-q-static.png";
export const SQR_BRAND_ASSETS = {
  full: {
    light: "/brand/sqr-full-logo-light.svg",
    dark: "/brand/sqr-full-logo-dark.svg",
  },
  icon: {
    light: transparentQ,
    dark: transparentQ,
  },
  /** Original transparent Q + dots, without the older boxed icon treatment. */
  transparentIcon: transparentQ,
  favicon: {
    svg: "/brand/favicon.svg",
    ico: "/brand/favicon.ico",
  },
  tabFavicon: {
    onlinePng: transparentQ,
    onlineIco: "/brand/favicon-online-v2.ico",
    offlinePng: "/brand/favicon-offline-v2-32.png",
  },
  appleTouchIcon: "/brand/apple-touch-icon-180x180.png",
  appIcon192: "/brand/icon-192x192.png",
  appIcon512: "/brand/icon-512x512.png",
  socialLogoLight: "/brand/sqr-social-logo-light.png",
  statusIcon: "/brand/sqr-q-status.svg",
} as const;

/** Intrinsic dimensions reserve the right aspect ratio before the image loads. */
export const SQR_BRAND_DIMENSIONS = {
  full: { width: 665, height: 310 },
  icon: { width: 128, height: 128 },
} as const;

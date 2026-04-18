const UI_MESSAGE_CATALOG = {
  dashboardUnexpectedResponse: {
    en: "The dashboard received an unexpected server response. Please refresh and try again.",
    ms: "Papan pemuka menerima respons pelayan yang tidak dijangka. Sila muat semula dan cuba lagi.",
  },
  unexpectedApiResponse: {
    en: "The server returned an unexpected response. Please refresh and try again.",
    ms: "Pelayan memulangkan respons yang tidak dijangka. Sila muat semula dan cuba lagi.",
  },
} as const;

export type UiMessageKey = keyof typeof UI_MESSAGE_CATALOG;
export const SUPPORTED_UI_LOCALES = ["en", "ms"] as const;
export type UiLocale = (typeof SUPPORTED_UI_LOCALES)[number];

export function resolveUiLocale(locale: string | null | undefined): UiLocale {
  const normalizedLocale = String(locale || "").trim().toLowerCase();
  if (normalizedLocale.startsWith("ms")) {
    return "ms";
  }
  return "en";
}

export function getUiMessage(key: UiMessageKey, locale?: string | null): string {
  return UI_MESSAGE_CATALOG[key][resolveUiLocale(locale)];
}

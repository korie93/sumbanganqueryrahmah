const UI_MESSAGE_CATALOG = {
  appRouteAutoRetryTitle: {
    en: "Retrying This Page Automatically",
    ms: "Sedang Cuba Semula Halaman Ini Secara Automatik",
  },
  appRouteGoHomeAction: {
    en: "Go Home",
    ms: "Pergi Ke Halaman Utama",
  },
  appRouteReloadAppAction: {
    en: "Reload App",
    ms: "Muat Semula Aplikasi",
  },
  appRouteRetryPageAction: {
    en: "Retry Page",
    ms: "Cuba Semula Halaman",
  },
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

export function formatAppRouteAutoRetryDescription(
  params: {
    attempt: number;
    delayMs: number | null;
    maxAttempts: number;
  },
  locale?: string | null,
): string {
  const attempt = Math.max(1, Math.trunc(params.attempt));
  const maxAttempts = Math.max(attempt, Math.trunc(params.maxAttempts));
  const countdownText = params.delayMs && params.delayMs > 0
    ? Math.max(1, Math.ceil(params.delayMs / 1000)).toString()
    : null;

  if (resolveUiLocale(locale) === "ms") {
    return `Bundle halaman gagal dimuatkan. Sedang cuba semula secara automatik (${attempt}/${maxAttempts})${countdownText ? ` dalam ${countdownText}s` : ""}.`;
  }

  return `A page bundle failed to load. Trying again automatically (${attempt}/${maxAttempts})${countdownText ? ` in ${countdownText}s` : ""}.`;
}

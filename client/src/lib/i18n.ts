import enAuth from "@/locales/en/auth.json";
import enCommon from "@/locales/en/common.json";
import enErrors from "@/locales/en/errors.json";
import enForms from "@/locales/en/forms.json";
import msAuth from "@/locales/ms/auth.json";
import msCommon from "@/locales/ms/common.json";
import msErrors from "@/locales/ms/errors.json";
import msForms from "@/locales/ms/forms.json";

export const SUPPORTED_LOCALES = ["ms", "en"] as const;
export type AppLocale = typeof SUPPORTED_LOCALES[number];
type TranslationNamespace = "auth" | "common" | "errors" | "forms";
type TranslationDictionary = Record<string, string>;
type TranslationParams = Record<string, string | number | null | undefined>;

const DEFAULT_LOCALE: AppLocale = "ms";
const resources: Record<AppLocale, Record<TranslationNamespace, TranslationDictionary>> = {
  en: {
    auth: enAuth,
    common: enCommon,
    errors: enErrors,
    forms: enForms,
  },
  ms: {
    auth: msAuth,
    common: msCommon,
    errors: msErrors,
    forms: msForms,
  },
};

let activeLocale: AppLocale = DEFAULT_LOCALE;

export function normalizeAppLocale(value: string | null | undefined): AppLocale {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized.startsWith("en") ? "en" : DEFAULT_LOCALE;
}

export function getAppLocale() {
  return activeLocale;
}

export function setAppLocale(locale: string) {
  activeLocale = normalizeAppLocale(locale);
  return activeLocale;
}

function interpolate(template: string, params?: TranslationParams | undefined) {
  if (!params) {
    return template;
  }

  return template.replace(/\{([a-zA-Z0-9_.-]+)\}/g, (match, key: string) => {
    const value = params[key];
    return value === null || value === undefined ? match : String(value);
  });
}

function readTranslation(locale: AppLocale, namespace: TranslationNamespace, key: string) {
  return resources[locale][namespace][key] || resources[DEFAULT_LOCALE][namespace][key] || "";
}

export function translate(
  key: `${TranslationNamespace}.${string}`,
  params?: TranslationParams | undefined,
  locale: AppLocale = activeLocale,
) {
  const [namespace, ...keyParts] = key.split(".");
  const translation = readTranslation(
    normalizeAppLocale(locale),
    namespace as TranslationNamespace,
    keyParts.join("."),
  );

  return interpolate(translation || key, params);
}

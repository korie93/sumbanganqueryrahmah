import type { AppLocale } from "@/lib/i18n";
import { getAppLocale, setAppLocale, SUPPORTED_LOCALES, translate } from "@/lib/i18n";

type LanguageSwitcherProps = {
  id?: string | undefined;
  locale?: AppLocale | undefined;
  onLocaleChange?: ((locale: AppLocale) => void) | undefined;
};

/**
 * Renders the shared language switcher component used across SQR screens.
 */
export function LanguageSwitcher({
  id = "app-language-switcher",
  locale = getAppLocale(),
  onLocaleChange = setAppLocale,
}: LanguageSwitcherProps) {
  return (
    <div className="inline-flex items-center gap-1" role="group" aria-label={translate("common.app.language.switcherLabel")}>
      {SUPPORTED_LOCALES.map((option) => {
        const pressedProps = locale === option
          ? { "aria-pressed": "true" as const }
          : { "aria-pressed": "false" as const };

        return (
          <button
            key={option}
            id={`${id}-${option}`}
            type="button"
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-border/60 px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            {...pressedProps}
            onClick={() => onLocaleChange(option)}
          >
            {translate(`common.app.language.${option}`)}
          </button>
        );
      })}
    </div>
  );
}

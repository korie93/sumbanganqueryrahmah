import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { ArrowLeft, Check, Moon, Sun, WifiOff } from "lucide-react";
import { useLocation } from "wouter";
import { useAuthLocale } from "./useAuthLocale";
import { getAriaPressedProps } from "@/lib/aria-state-props";
import { safeJsonParseResult } from "@/lib/utils/safe-json";
import { BrandLogo } from "@/components/BrandLogo";
import { useTheme } from "@/components/useTheme";
import { AuthLink } from "./AuthLink";
import { AuthBrandArtwork } from "./AuthBrandArtwork";
import { getActiveViewTransitionKind } from "@/lib/view-transition";
import { hasPublicAuthArrival } from "@/lib/auth-navigation-preload";
import "./AuthV17Layout.css";

type Props = {
  children: ReactNode;
  title: string;
  description: string;
  icon?: ReactNode;
  badge?: string;
  contentBusy?: boolean;
  showBackButton?: boolean;
  backLabel?: string;
  onBackClick?: () => void;
  className?: string;
  visualMode?: "standard" | "minimal";
  controlledAccess?: boolean;
  recoveryArtwork?: boolean;
  headingRef?: RefObject<HTMLHeadingElement>;
};

const AuthShellContext = createContext<{ hasShownForm: { current: boolean } } | null>(null);
type ShellProps = Pick<Props, "children" | "showBackButton" | "backLabel" | "onBackClick" | "className" | "recoveryArtwork">;

/** Persistent public chrome; page-owned auth state stays below this boundary. */
export function AuthV17Shell({ children, showBackButton = true, backLabel, onBackClick,
  className = "", recoveryArtwork = false }: ShellProps) {
  const hasShownForm = useRef(false);
  const frame = useMemo(() => ({ hasShownForm }), []);
  const [, navigate] = useLocation();
  const { locale, setLocale, t } = useAuthLocale();
  const { theme: surfaceTheme, isDark, toggleTheme } = useTheme();
  const themeLabel = locale === "en"
    ? isDark ? "Switch to light mode" : "Switch to dark mode"
    : isDark ? "Tukar ke tema cerah" : "Tukar ke tema gelap";
  const [offline, setOffline] = useState(false);
  const [health, setHealth] = useState<"ready" | "unavailable" | null>(null);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    // One bounded request per mounted layout, no polling or service detail rendering.
    void fetch("/api/health", { credentials: "omit", cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const parsed = safeJsonParseResult<unknown>(await response.text(), { maxRawLength: 2048 });
        const body = parsed.ok ? parsed.data : null;
        if (controller.signal.aborted) return;
        setHealth(response.ok && typeof body === "object" && body !== null
          && "ready" in body && body.ready === true ? "ready" : "unavailable");
      }).catch(() => { /* An unknown health response is hidden, never fabricated. */ })
      .finally(() => window.clearTimeout(timeout));
    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, []);

  return (
    <main id="main-content" tabIndex={-1} lang={locale} data-theme={surfaceTheme} className={`auth-v17 auth-shell ${className}${recoveryArtwork ? " auth-v17-recovery-artwork" : ""}`}>
      <section className="auth-v17-brand-panel" aria-label={t("auth.v17.platform")}>
        <div className="auth-v17-curve" aria-hidden="true" />
        <div className="auth-v17-top">
          <div className="auth-v17-brand">
            <BrandLogo variant="full" theme={surfaceTheme} priority className="auth-v17-logo" />
            <small>{t("auth.v17.platform")}</small>
          </div>
          {health && !offline ? <span className={`auth-v17-status${health === "ready" ? "" : " auth-v17-status--warn"}`} role="status">
            <i aria-hidden="true" />{t(health === "ready" ? "auth.v17.operational" : "auth.v17.unavailable")}
          </span> : null}
        </div>
        <p className="auth-v17-intro">{t("auth.v17.intro")}</p>
        <AuthBrandArtwork theme={surfaceTheme} recoveryArtwork={recoveryArtwork} />
      </section>
      <section className="auth-v17-side" aria-label={t(recoveryArtwork ? "auth.v17Recovery.forgotTitle" : "auth.v17.signin")}>
        <div className="auth-v17-wrap">
          <div className="auth-v17-topline">
            {showBackButton ? <AuthLink to="/" kind="page" className="auth-v17-back" onNavigate={onBackClick ?? (() => navigate("/"))}>
              <ArrowLeft size={15} aria-hidden="true" />{backLabel ?? t("auth.v17.back")}
            </AuthLink> : <span />}
            <div className="auth-v17-topright">
              {typeof location !== "undefined" && location.protocol === "https:" ?
                <span className="auth-v17-secure"><i aria-hidden="true" />{t("auth.v17.secure")}</span> : null}
              <button type="button" className="auth-v17-theme" onClick={toggleTheme} aria-label={themeLabel} title={themeLabel}>
                {isDark ? <Sun size={19} aria-hidden="true" focusable="false" /> : <Moon size={19} aria-hidden="true" focusable="false" />}
              </button>
              <div className="auth-v17-lang" role="group" aria-label="Bahasa / Language">
                <button type="button" lang="ms" aria-label="Bahasa Melayu" {...getAriaPressedProps(locale === "ms")} onClick={() => setLocale("ms")}>BM</button>
                <button type="button" lang="en" aria-label="English" {...getAriaPressedProps(locale === "en")} onClick={() => setLocale("en")}>EN</button>
              </div>
            </div>
          </div>
          {offline ? <div className="auth-v17-offline" role="status"><WifiOff size={18} aria-hidden="true" />{t("auth.v17.offline")}</div> : null}
          <div className="auth-form-slot">
            <AuthShellContext.Provider value={frame}>{children}</AuthShellContext.Provider>
          </div>
          <p className="auth-v17-help">{t("auth.v17.support")}</p>
        </div>
      </section>
    </main>
  );
}

/** Page content adapter also retains standalone rendering for existing callers. */
export function AuthV17Layout({ children, title, description, icon, contentBusy = false,
  controlledAccess = false, headingRef, ...shellProps }: Props) {
  const embedded = useContext(AuthShellContext);
  const { t } = useAuthLocale();
  const localHeadingRef = useRef<HTMLHeadingElement>(null);
  const titleRef = headingRef ?? localHeadingRef;
  const [focusOnArrival] = useState(() => Boolean(embedded?.hasShownForm.current || hasPublicAuthArrival()));
  const [animateArrival] = useState(() => getActiveViewTransitionKind() === null);
  useEffect(() => {
    if (!embedded) return;
    if (focusOnArrival) titleRef.current?.focus({ preventScroll: true });
    embedded.hasShownForm.current = true;
  }, [embedded, focusOnArrival, titleRef]);
  const content = <>
    <div className={`auth-v17-view${animateArrival ? " auth-form-enter" : ""}`}>
      {icon ? <div className="auth-v17-icon">{icon}</div> : null}
      <h1 id="auth-v17-title" ref={titleRef} tabIndex={-1}>{title}</h1>
      <p className="auth-v17-subtitle">{description}</p>
      <div className="auth-v17-content" aria-busy={contentBusy || undefined}>{children}</div>
      {controlledAccess ? <div className="auth-v17-assure"><Check size={18} aria-hidden="true" /><div>
        <strong>{t("auth.v17.controlled")}</strong><br />{t("auth.v17.assurance")}
      </div></div> : null}
    </div>
  </>;
  return embedded ? content : <AuthV17Shell {...shellProps}>{content}</AuthV17Shell>;
}

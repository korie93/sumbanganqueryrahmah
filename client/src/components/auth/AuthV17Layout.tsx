import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Check, WifiOff } from "lucide-react";
import { useLocation } from "wouter";
import { useAuthLocale } from "./useAuthLocale";
import { getAriaPressedProps } from "@/lib/aria-state-props";
import { safeJsonParseResult } from "@/lib/utils/safe-json";
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
};

/** Shared V17 presentation shell. Authentication state and API calls remain owned by each existing flow. */
export function AuthV17Layout({ children, title, description, icon, contentBusy = false,
  showBackButton = true, backLabel, onBackClick, className = "", controlledAccess = false }: Props) {
  const [, navigate] = useLocation();
  const { locale, setLocale, t } = useAuthLocale();
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
    <main id="main-content" tabIndex={-1} lang={locale} className={`auth-v17 ${className}`}>
      <section className="auth-v17-brand-panel" aria-label={t("auth.v17.platform")}>
        <div className="auth-v17-curve" aria-hidden="true" />
        <div className="auth-v17-top">
          <div className="auth-v17-brand"><div className="auth-v17-mark" aria-hidden="true">SQR</div>
            <div>SQR<small>{t("auth.v17.platform")}</small></div>
          </div>
          {health && !offline ? <span className={`auth-v17-status${health === "ready" ? "" : " auth-v17-status--warn"}`} role="status">
            <i aria-hidden="true" />{t(health === "ready" ? "auth.v17.operational" : "auth.v17.unavailable")}
          </span> : null}
        </div>
        <p className="auth-v17-intro">{t("auth.v17.intro")}</p>
        <div className="auth-v17-art" aria-hidden="true" />
      </section>
      <section className="auth-v17-side" aria-labelledby="auth-v17-title">
        <div className="auth-v17-wrap">
          <div className="auth-v17-topline">
            {showBackButton ? <button type="button" className="auth-v17-back" onClick={onBackClick ?? (() => navigate("/"))}>
              <ArrowLeft size={15} aria-hidden="true" />{backLabel ?? t("auth.v17.back")}
            </button> : <span />}
            <div className="auth-v17-topright">
              {typeof location !== "undefined" && location.protocol === "https:" ?
                <span className="auth-v17-secure"><i aria-hidden="true" />{t("auth.v17.secure")}</span> : null}
              <div className="auth-v17-lang" role="group" aria-label="Bahasa / Language">
                <button type="button" lang="ms" aria-label="Bahasa Melayu" {...getAriaPressedProps(locale === "ms")} onClick={() => setLocale("ms")}>BM</button>
                <button type="button" lang="en" aria-label="English" {...getAriaPressedProps(locale === "en")} onClick={() => setLocale("en")}>EN</button>
              </div>
            </div>
          </div>
          {offline ? <div className="auth-v17-offline" role="status"><WifiOff size={18} aria-hidden="true" />{t("auth.v17.offline")}</div> : null}
          <div className="auth-v17-view">
            {icon ? <div className="auth-v17-icon">{icon}</div> : null}
            <h1 id="auth-v17-title">{title}</h1>
            <p className="auth-v17-subtitle">{description}</p>
            <div className="auth-v17-content" aria-busy={contentBusy || undefined}>{children}</div>
            {controlledAccess ? <div className="auth-v17-assure"><Check size={18} aria-hidden="true" /><div>
              <strong>{t("auth.v17.controlled")}</strong><br />{t("auth.v17.assurance")}
            </div></div> : null}
          </div>
          <p className="auth-v17-help">{t("auth.v17.support")}</p>
        </div>
      </section>
    </main>
  );
}

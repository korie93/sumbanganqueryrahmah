import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, LockKeyhole, Moon, Sun, WifiOff } from "lucide-react";
import { SQR_BRAND_ASSETS, SQR_BRAND_DIMENSIONS } from "@shared/brand-assets";
import { useTheme } from "@/components/useTheme";
import { getAriaPressedProps } from "@/lib/aria-state-props";
import { formatPublicAuthExpiry } from "@/pages/public-auth-runtime-utils";
import { useAuthLocale } from "./useAuthLocale";
import "./CredentialRecoveryLayout.css";

type RecoveryAccount = { username: string; role: string; expiresAt: string };

type CredentialRecoveryLayoutProps = {
  account?: RecoveryAccount | null;
  children: ReactNode;
  contentBusy?: boolean;
  description: string;
  intent: "activation" | "reset";
  onBackClick?: () => void;
  title: string;
};

/** Presentation only: validated account metadata comes from the existing page controller. */
export function CredentialRecoveryLayout({
  account,
  children,
  contentBusy = false,
  description,
  intent,
  onBackClick,
  title,
}: CredentialRecoveryLayoutProps) {
  const { locale, setLocale, t } = useAuthLocale();
  const { isDark, toggleTheme } = useTheme();
  const english = locale === "en";
  const [offline, setOffline] = useState(false);

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

  return (
    <main id="main-content" tabIndex={-1} lang={locale} className="credential-recovery password-creation-layout">
      <div className="credential-recovery__workspace">
        <aside className="credential-recovery__context" aria-labelledby="credential-recovery-context-title">
          <div className="credential-recovery__brand">
            <img src={SQR_BRAND_ASSETS.transparentIcon} width={SQR_BRAND_DIMENSIONS.icon.width} height={SQR_BRAND_DIMENSIONS.icon.height} alt="" aria-hidden="true" decoding="async" className="credential-recovery__logo" />
            <span>SQR</span>
          </div>
          <div className="credential-recovery__context-copy">
            <h2 id="credential-recovery-context-title">{english ? "SQR account access" : "Akses akaun SQR"}</h2>
            <p>{intent === "activation"
              ? english ? "Create a password to complete your account activation." : "Cipta kata laluan untuk melengkapkan pengaktifan akaun anda."
              : english ? "Set a new password to access your account." : "Tetapkan kata laluan baharu untuk akses ke akaun anda."}</p>
          </div>
          {account ? <dl className="public-auth-account-summary">
            <div className="public-auth-account-summary__row credential-recovery__username">
              <dt>{t("auth.v17Recovery.username")}</dt>
              <dd>{account.username}</dd>
            </div>
            <div className="public-auth-account-summary__row">
              <dt>{t("auth.v17Recovery.role")}</dt>
              <dd>{account.role}</dd>
            </div>
            <div className="public-auth-account-summary__row">
              <dt>{t("auth.v17Recovery.expires")}</dt>
              <dd>{formatPublicAuthExpiry(account.expiresAt)} <span className="credential-recovery__timezone">(MYT)</span></dd>
            </div>
          </dl> : null}
          <p className="credential-recovery__security"><LockKeyhole size={18} aria-hidden="true" focusable="false" /><span>{english
            ? "One-time link. Never share this link or your password."
            : "Pautan sekali guna. Jangan kongsi pautan atau kata laluan."}</span></p>
        </aside>
        <section className="credential-recovery__main" aria-labelledby="credential-recovery-title">
          <div className="credential-recovery__controls">
            {onBackClick ? <button type="button" className="credential-recovery__home" onClick={onBackClick}>
              <ArrowLeft size={16} aria-hidden="true" focusable="false" />{t("auth.v17.back")}
            </button> : null}
            <div className="credential-recovery__preferences">
              <button type="button" className="credential-recovery__theme" onClick={toggleTheme} aria-label={english
                ? isDark ? "Switch to light mode" : "Switch to dark mode"
                : isDark ? "Tukar ke tema cerah" : "Tukar ke tema gelap"}>
                {isDark ? <Sun size={19} aria-hidden="true" focusable="false" /> : <Moon size={19} aria-hidden="true" focusable="false" />}
              </button>
              <div className="credential-recovery__language" role="group" aria-label="Bahasa / Language">
                <button type="button" lang="ms" aria-label="Bahasa Melayu" {...getAriaPressedProps(locale === "ms")} onClick={() => setLocale("ms")}>BM</button>
                <button type="button" lang="en" aria-label="English" {...getAriaPressedProps(locale === "en")} onClick={() => setLocale("en")}>EN</button>
              </div>
            </div>
          </div>
          <div className="credential-recovery__form-wrap">
            {offline ? <p className="credential-recovery__offline" role="status"><WifiOff size={18} aria-hidden="true" focusable="false" /><span>{t("auth.v17.offline")}</span></p> : null}
            <h1 id="credential-recovery-title">{title}</h1>
            <p className="credential-recovery__description">{description}</p>
            <div className="credential-recovery__content" aria-busy={contentBusy || undefined}>{children}</div>
            <p className="credential-recovery__help">{english ? "Need help? Contact your administrator." : "Perlukan bantuan? Hubungi pentadbir."}</p>
          </div>
        </section>
      </div>
    </main>
  );
}

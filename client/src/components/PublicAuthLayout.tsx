import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import "./PublicAuthLayout.css";

type PublicAuthLayoutProps = {
  badge: string;
  title: string;
  description: string;
  icon: ReactNode;
  children: ReactNode;
  showBackButton?: boolean;
  backLabel?: string;
  contentBusy?: boolean;
  onBackClick?: () => void;
};

export function PublicAuthLayout({
  badge,
  title,
  description,
  icon,
  children,
  showBackButton = true,
  backLabel = "Kembali ke landing page",
  contentBusy = false,
  onBackClick,
}: PublicAuthLayoutProps) {
  const contentBusyProps = contentBusy ? { "aria-busy": "true" as const } : {};

  return (
    <div className="public-auth-layout viewport-min-height">
      <div className="public-auth-layout__pattern" />
      <div className="public-auth-layout__glow public-auth-layout__glow--top" />
      <div className="public-auth-layout__glow public-auth-layout__glow--bottom" />
      <div className="public-auth-layout__center-glow" />

      <main className="public-auth-layout__main viewport-min-height">
        <div className="public-auth-layout__container">
          {showBackButton ? (
            <button
              type="button"
              onClick={() => {
                if (onBackClick) {
                  onBackClick();
                  return;
                }
                window.location.href = "/";
              }}
              className="public-auth-layout__back-button"
            >
              <ArrowLeft className="h-4 w-4" />
              {backLabel}
            </button>
          ) : null}

          <div className="public-auth-layout__halo" />

          <div className="public-auth-layout__card">
            <div className="public-auth-layout__brand">
              <div className="public-auth-layout__brand-icon">
                <BrandLogo decorative priority className="h-8 w-8" imageClassName="h-full w-full" />
              </div>
              <div className="min-w-0">
                <p className="public-auth-layout__badge">
                  {badge}
                </p>
                <p className="public-auth-layout__brand-copy">
                  Platform operasi dalaman Sumbangan Query Rahmah
                </p>
              </div>
            </div>

            <div className="public-auth-layout__intro">
              <div className="public-auth-layout__intro-icon">
                {icon}
              </div>
              <h1 className="public-auth-layout__title">{title}</h1>
              <p className="public-auth-layout__description">{description}</p>
            </div>

            <div className="public-auth-layout__content" {...contentBusyProps}>
              {children}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

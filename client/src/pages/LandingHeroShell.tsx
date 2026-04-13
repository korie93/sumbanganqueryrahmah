import type { ReactNode } from "react";
import { ArrowRight, LogIn } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import "./Landing.css";

type LandingHeroShellProps = {
  leftDetail: ReactNode;
  rightPane: ReactNode;
};

export const landingPrimaryButtonClassName =
  "landing-primary-button inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors";

export const landingSecondaryButtonClassName =
  "landing-secondary-button inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors";

export function LandingHeroShell({
  leftDetail,
  rightPane,
}: LandingHeroShellProps) {
  return (
    <section className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
      <div className="space-y-7">
        <div className="landing-badge inline-flex items-center rounded-full px-3 py-1 text-xs font-medium">
          Untuk kegunaan operasi dalaman berdaftar
        </div>
        <div className="space-y-4">
          <h1 className="landing-title max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Platform kerja dalaman untuk carian, semakan, dan pengurusan rekod sumbangan.
          </h1>
          <p className="landing-copy max-w-2xl text-base leading-7 sm:text-lg">
            SQR menyediakan ruang kerja yang tersusun untuk menjalankan general search, menyemak
            rekod, dan merujuk data operasi secara cepat, terkawal, serta mudah difahami oleh
            pengguna harian.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="landing-chip rounded-full px-3 py-1 text-xs">
            General Search
          </span>
          <span className="landing-chip rounded-full px-3 py-1 text-xs">
            Akses Terkawal
          </span>
          <span className="landing-chip rounded-full px-3 py-1 text-xs">
            Antara Muka Ringan
          </span>
        </div>
        {leftDetail}
      </div>

      {rightPane}
    </section>
  );
}

type LandingPageShellProps = {
  onLoginClick: () => void;
  children: ReactNode;
};

export function LandingPageShell({ onLoginClick, children }: LandingPageShellProps) {
  return (
    <div className="landing-page viewport-min-height">
      <div className="mx-auto flex viewport-min-height w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="landing-shell flex items-center justify-between gap-4 rounded-3xl px-4 py-3 backdrop-blur sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="landing-brand-shell flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl">
              <BrandLogo decorative priority className="h-7 w-7" imageClassName="h-full w-full" />
            </div>
            <div className="min-w-0">
              <p className="landing-brand-title truncate text-sm font-semibold tracking-wide">SQR System</p>
              <p className="landing-brand-copy truncate text-xs">
                Platform operasi dalaman Sumbangan Query Rahmah
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <nav className="landing-nav hidden items-center gap-1 rounded-xl p-1 md:flex">
              <a
                href="#features"
                className="landing-nav-link rounded-lg px-3 py-2 text-sm transition-colors"
              >
                Fungsi
              </a>
              <a
                href="#security"
                className="landing-nav-link rounded-lg px-3 py-2 text-sm transition-colors"
              >
                Keselamatan
              </a>
              <a
                href="#about"
                className="landing-nav-link rounded-lg px-3 py-2 text-sm transition-colors"
              >
                Tentang
              </a>
            </nav>
            <button type="button" onClick={onLoginClick} className={landingPrimaryButtonClassName}>
              <LogIn className="h-4 w-4" />
              Log In
            </button>
          </div>
        </header>

        <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col justify-center py-10 sm:py-14">
          {children}
        </main>
      </div>
    </div>
  );
}

export function LandingPrimaryActionRow({ onLoginClick }: { onLoginClick: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={onLoginClick}
        className={`${landingPrimaryButtonClassName} min-h-11 px-5`}
      >
        Log In ke Sistem
        <ArrowRight className="ml-2 h-4 w-4" />
      </button>
      <div className="landing-action-note rounded-xl px-4 py-3 text-sm">
        Halaman ini menerangkan fungsi teras sistem secara padat. Akses penuh tersedia selepas log
        masuk.
      </div>
    </div>
  );
}

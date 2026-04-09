import { Home, LogIn, SearchX } from "lucide-react";
import "./NotFound.css";

type NotFoundProps = {
  onNavigateHome: () => void;
  onLoginClick: () => void;
};

export default function NotFound({ onNavigateHome, onLoginClick }: NotFoundProps) {
  return (
    <main className="not-found-page viewport-min-height overflow-hidden px-4 py-8 sm:px-6">
      <section
        className="relative mx-auto flex min-h-[calc(100svh-4rem)] max-w-4xl items-center justify-center"
        aria-labelledby="not-found-title"
      >
        <div className="not-found-page__orb--primary pointer-events-none absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl" />
        <div className="not-found-page__orb--secondary pointer-events-none absolute right-10 top-20 hidden h-44 w-44 rounded-full blur-3xl sm:block" />

        <div className="not-found-page__card relative w-full rounded-[2rem] p-6 backdrop-blur-xl sm:p-10">
          <div className="not-found-page__icon-shell mx-auto flex h-16 w-16 items-center justify-center rounded-2xl">
            <SearchX className="not-found-page__icon h-8 w-8" />
          </div>

          <div className="mx-auto mt-6 max-w-2xl text-center">
            <p className="not-found-page__kicker text-xs font-semibold uppercase tracking-[0.28em]">
              404
            </p>
            <h1 id="not-found-title" className="not-found-page__title mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Halaman tidak dijumpai
            </h1>
            <p className="not-found-page__copy mt-4 text-sm leading-7 sm:text-base">
              Pautan ini mungkin telah berubah, tersalah taip, atau tidak tersedia untuk paparan
              awam. Anda boleh kembali ke landing page atau terus buka halaman log masuk.
            </p>
          </div>

          <div className="mx-auto mt-8 grid max-w-xl gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={onNavigateHome}
              className="not-found-page__secondary-button inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold transition-colors"
            >
              <Home className="mr-2 h-4 w-4" />
              Ke Landing Page
            </button>
            <button
              type="button"
              onClick={onLoginClick}
              className="not-found-page__primary-button inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold transition-colors"
            >
              <LogIn className="mr-2 h-4 w-4" />
              Buka Login
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

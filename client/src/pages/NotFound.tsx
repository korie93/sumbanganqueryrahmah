import { Home, LogIn, SearchX } from "lucide-react";

type NotFoundProps = {
  onNavigateHome: () => void;
  onLoginClick: () => void;
};

export default function NotFound({ onNavigateHome, onLoginClick }: NotFoundProps) {
  return (
    <main className="viewport-min-height overflow-hidden bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950 px-4 py-8 text-white sm:px-6">
      <section
        className="relative mx-auto flex min-h-[calc(100svh-4rem)] max-w-4xl items-center justify-center"
        aria-labelledby="not-found-title"
      >
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-500/15 blur-3xl" />
        <div className="pointer-events-none absolute right-10 top-20 hidden h-44 w-44 rounded-full bg-cyan-300/10 blur-3xl sm:block" />

        <div className="relative w-full rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 shadow-2xl shadow-black/25 backdrop-blur-xl sm:p-10">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-blue-300/25 bg-blue-300/10">
            <SearchX className="h-8 w-8 text-blue-200" />
          </div>

          <div className="mx-auto mt-6 max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-200">
              404
            </p>
            <h1 id="not-found-title" className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Halaman tidak dijumpai
            </h1>
            <p className="mt-4 text-sm leading-7 text-slate-300 sm:text-base">
              Pautan ini mungkin telah berubah, tersalah taip, atau tidak tersedia untuk paparan
              awam. Anda boleh kembali ke landing page atau terus buka halaman log masuk.
            </p>
          </div>

          <div className="mx-auto mt-8 grid max-w-xl gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={onNavigateHome}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/15 bg-white/10 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200/70"
            >
              <Home className="mr-2 h-4 w-4" />
              Ke Landing Page
            </button>
            <button
              type="button"
              onClick={onLoginClick}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200/80"
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

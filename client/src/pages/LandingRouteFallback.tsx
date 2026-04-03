import { LogIn } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";

type LandingRouteFallbackProps = {
  onLoginClick: () => void;
};

export default function LandingRouteFallback({ onLoginClick }: LandingRouteFallbackProps) {
  const primaryButtonClassName =
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-blue-500 bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70";

  return (
    <div className="viewport-min-height bg-slate-950 text-slate-50">
      <div className="mx-auto flex viewport-min-height w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-4 rounded-3xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-slate-900/80">
              <BrandLogo decorative priority className="h-7 w-7" imageClassName="h-full w-full" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-wide text-white">SQR System</p>
              <p className="truncate text-xs text-slate-300">Platform operasi dalaman Sumbangan Query Rahmah</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onLoginClick}
            className={primaryButtonClassName}
          >
            <LogIn className="h-4 w-4" />
            Log In
          </button>
        </header>

        <main className="flex flex-1 flex-col justify-center py-10 sm:py-14">
          <section className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div className="space-y-7">
              <div className="inline-flex items-center rounded-full border border-blue-400/25 bg-blue-400/10 px-3 py-1 text-xs font-medium text-blue-100">
                Untuk kegunaan operasi dalaman berdaftar
              </div>
              <div className="space-y-4">
                <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                  Platform kerja dalaman untuk carian, semakan, dan pengurusan rekod sumbangan.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                  SQR menyediakan ruang kerja yang tersusun untuk menjalankan general search,
                  menyemak rekod, dan merujuk data operasi secara cepat, terkawal, serta mudah
                  difahami oleh pengguna harian.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                  General Search
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                  Akses Terkawal
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                  Antara Muka Ringan
                </span>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/20 backdrop-blur">
              <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/80 p-6" aria-hidden="true">
                <div className="h-3 w-32 rounded-full bg-white/10" />
                <div className="h-8 max-w-sm rounded-2xl bg-white/10" />
                <div className="h-3 max-w-md rounded-full bg-white/10" />
                <div className="h-3 max-w-lg rounded-full bg-white/10" />
                <div className="pt-2 space-y-3">
                  <div className="h-16 rounded-2xl border border-white/10 bg-white/5" />
                  <div className="h-16 rounded-2xl border border-white/10 bg-white/5" />
                  <div className="h-16 rounded-2xl border border-white/10 bg-white/5" />
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

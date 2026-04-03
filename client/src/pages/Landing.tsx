import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, LogIn } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import "./Landing.css";

type LandingProps = {
  onLoginClick: () => void;
};

const aboutHighlights = [
  "Akses terhad kepada pengguna dalaman yang berdaftar.",
  "Carian, semakan, dan rujukan data disatukan dalam satu ruang kerja.",
  "Paparan direka ringkas supaya tugas harian dapat diselesaikan dengan lebih cepat.",
];

const LandingDeferredSections = lazy(() => import("./LandingDeferredSections"));

type LandingDeferredSectionsFallbackProps = {
  onLoginClick: () => void;
  secondaryButtonClassName: string;
};

function LandingDeferredSectionsFallback({
  onLoginClick,
  secondaryButtonClassName,
}: LandingDeferredSectionsFallbackProps) {
  return (
    <>
      <section
        id="features"
        className="landing-deferred-section mt-12 rounded-3xl border border-white/10 bg-white/[0.03] px-5 py-6"
        aria-hidden="true"
      >
        <div className="max-w-3xl space-y-3">
          <div className="h-3.5 w-24 rounded-full bg-white/10" />
          <div className="h-7 max-w-md rounded-2xl bg-white/10" />
          <div className="h-3 max-w-2xl rounded-full bg-white/10" />
        </div>
      </section>

      <section
        id="security"
        className="landing-deferred-section mt-6 rounded-3xl border border-emerald-400/15 bg-emerald-400/[0.04] px-5 py-6"
        aria-hidden="true"
      >
        <div className="max-w-3xl space-y-3">
          <div className="h-4 w-36 rounded-full bg-emerald-200/15" />
          <div className="h-3 max-w-3xl rounded-full bg-white/10" />
          <div className="h-3 max-w-2xl rounded-full bg-white/10" />
        </div>
      </section>

      <footer className="landing-deferred-section border-t border-white/10 pt-6 text-sm text-slate-400">
        <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="font-medium text-slate-200">
              SQR dibina untuk operasi dalaman yang fokus, ringkas, dan terkawal.
            </p>
            <p>
              Halaman ini diwujudkan untuk memberi gambaran ringkas tentang fungsi utama sistem
              tanpa elemen promosi, borang pertanyaan, atau kandungan yang tidak diperlukan.
            </p>
          </div>
          <button
            type="button"
            onClick={onLoginClick}
            className={secondaryButtonClassName}
          >
            <LogIn className="mr-2 h-4 w-4" />
            Buka Login
          </button>
        </div>
      </footer>
    </>
  );
}

export default function Landing({ onLoginClick }: LandingProps) {
  const [shouldLoadDeferredSections, setShouldLoadDeferredSections] = useState(false);
  const deferredSectionsTriggerRef = useRef<HTMLDivElement | null>(null);
  const primaryButtonClassName =
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-blue-500 bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70";
  const secondaryButtonClassName =
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/15 bg-slate-900/60 px-4 text-sm font-semibold text-slate-100 transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25";

  useEffect(() => {
    if (shouldLoadDeferredSections) {
      return;
    }

    let cancelled = false;
    let observer: IntersectionObserver | null = null;
    let timeoutHandle: number | null = null;

    const loadDeferredSections = () => {
      if (!cancelled) {
        setShouldLoadDeferredSections(true);
      }
    };

    if (typeof window.IntersectionObserver === "function" && deferredSectionsTriggerRef.current) {
      observer = new window.IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) {
            return;
          }

          observer?.disconnect();
          observer = null;
          loadDeferredSections();
        },
        {
          rootMargin: "320px 0px",
        },
      );
      observer.observe(deferredSectionsTriggerRef.current);
    } else {
      timeoutHandle = window.setTimeout(loadDeferredSections, 1200);
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
      observer = null;
      if (timeoutHandle !== null) {
        window.clearTimeout(timeoutHandle);
      }
    };
  }, [shouldLoadDeferredSections]);

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
          <div className="flex items-center gap-2">
            <nav className="hidden items-center gap-1 rounded-xl border border-white/10 bg-slate-900/60 p-1 md:flex">
              <a
                href="#features"
                className="rounded-lg px-3 py-2 text-sm text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
              >
                Fungsi
              </a>
              <a
                href="#security"
                className="rounded-lg px-3 py-2 text-sm text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
              >
                Keselamatan
              </a>
              <a
                href="#about"
                className="rounded-lg px-3 py-2 text-sm text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
              >
                Tentang
              </a>
            </nav>
            <button
              type="button"
              onClick={onLoginClick}
              className={primaryButtonClassName}
            >
              <LogIn className="mr-2 h-4 w-4" />
              Log In
            </button>
          </div>
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
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={onLoginClick}
                  className={`${primaryButtonClassName} min-h-11 px-5`}
                >
                  Log In ke Sistem
                  <ArrowRight className="ml-2 h-4 w-4" />
                </button>
                <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                  Halaman ini menerangkan fungsi teras sistem secara padat. Akses penuh tersedia
                  selepas log masuk.
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Fokus
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-200">
                    General search dan semakan rekod tanpa paparan yang berserabut.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Ketertiban
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-200">
                    Susun atur dibina untuk kerja dalaman yang berulang dan memerlukan ketepatan.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Kawalan
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-200">
                    Akses sistem dikawal melalui log masuk dan semakan keselamatan yang berkaitan.
                  </p>
                </div>
              </div>
            </div>

            <div
              id="about"
              className="landing-secondary-pane rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/20 backdrop-blur"
            >
              <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                  Tentang Sistem
                </p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">
                  Ruang kerja digital untuk semakan data yang lebih teratur.
                </h2>
                <p className="mt-4 text-sm leading-7 text-slate-300">
                  Sistem ini dibangunkan untuk kegunaan operasi dalaman dengan keutamaan pada
                  kelajuan carian, kebolehbacaan data, kawalan akses, dan aliran kerja yang
                  membantu pengguna menumpukan kepada tugas sebenar tanpa gangguan yang tidak perlu.
                </p>
                <div className="mt-5 space-y-3">
                  {aboutHighlights.map((item) => (
                    <div
                      key={item}
                      className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                    >
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-200" />
                      <p className="text-sm leading-6 text-slate-200">{item}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-slate-300">
                  Akses adalah terhad kepada pengguna berdaftar dan tertakluk kepada kawalan
                  peranan serta dasar keselamatan sistem.
                </div>
              </div>
            </div>
          </section>

          <div
            ref={deferredSectionsTriggerRef}
            className="h-px w-full"
            aria-hidden="true"
          />

          {shouldLoadDeferredSections ? (
            <Suspense
              fallback={(
                <LandingDeferredSectionsFallback
                  onLoginClick={onLoginClick}
                  secondaryButtonClassName={secondaryButtonClassName}
                />
              )}
            >
              <LandingDeferredSections
                onLoginClick={onLoginClick}
                secondaryButtonClassName={secondaryButtonClassName}
              />
            </Suspense>
          ) : (
            <LandingDeferredSectionsFallback
              onLoginClick={onLoginClick}
              secondaryButtonClassName={secondaryButtonClassName}
            />
          )}
        </main>
      </div>
    </div>
  );
}

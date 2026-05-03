import { Suspense, useEffect, useRef, useState } from "react";
import { CheckCircle2, LogIn } from "lucide-react";
import {
  LandingHeroShell,
  LandingPageShell,
  LandingPrimaryActionRow,
  landingSecondaryButtonClassName,
} from "@/pages/LandingHeroShell";
import { lazyWithPreload, scheduleIdlePreload } from "@/lib/lazy-with-preload";

type LandingProps = {
  onLoginClick: () => void;
};

const aboutHighlights = [
  "Akses terhad kepada pengguna dalaman yang berdaftar.",
  "Carian, semakan, dan rujukan data disatukan dalam satu ruang kerja.",
  "Paparan direka ringkas supaya tugas harian dapat diselesaikan dengan lebih cepat.",
];

const LandingDeferredSections = lazyWithPreload(() => import("./LandingDeferredSections"));
const LANDING_DEFERRED_SECTION_PRELOAD_DELAY_MS = 900;
const LANDING_DEFERRED_SECTION_ROOT_MARGIN = "320px 0px";
const LANDING_DEFERRED_SECTION_FALLBACK_DELAY_MS = 1_200;

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
        className="landing-deferred-section landing-placeholder-section mt-12 rounded-3xl px-5 py-6"
        aria-hidden="true"
      >
        <div className="max-w-3xl space-y-3">
          <div className="landing-placeholder-line h-3.5 w-24 rounded-full" />
          <div className="landing-placeholder-line h-7 max-w-md rounded-2xl" />
          <div className="landing-placeholder-line h-3 max-w-2xl rounded-full" />
        </div>
      </section>

      <section
        id="security"
        className="landing-deferred-section landing-placeholder-section landing-placeholder-section--accent mt-6 rounded-3xl px-5 py-6"
        aria-hidden="true"
      >
        <div className="max-w-3xl space-y-3">
          <div className="landing-placeholder-line landing-placeholder-line--accent h-4 w-36 rounded-full" />
          <div className="landing-placeholder-line h-3 max-w-3xl rounded-full" />
          <div className="landing-placeholder-line h-3 max-w-2xl rounded-full" />
        </div>
      </section>

      <footer className="landing-deferred-section landing-footer pt-6 text-sm">
        <div className="landing-placeholder-footer-shell flex flex-col gap-4 rounded-2xl px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="landing-footer-title font-medium">
              SQR dibina untuk operasi dalaman yang fokus, ringkas, dan terkawal.
            </p>
            <p className="landing-footer-copy">
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

  useEffect(() => {
    return scheduleIdlePreload(() => {
      LandingDeferredSections.preload();
    }, LANDING_DEFERRED_SECTION_PRELOAD_DELAY_MS);
  }, []);

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
          rootMargin: LANDING_DEFERRED_SECTION_ROOT_MARGIN,
        },
      );
      observer.observe(deferredSectionsTriggerRef.current);
    } else {
      timeoutHandle = window.setTimeout(
        loadDeferredSections,
        LANDING_DEFERRED_SECTION_FALLBACK_DELAY_MS,
      );
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
    <LandingPageShell onLoginClick={onLoginClick}>
      <LandingHeroShell
        leftDetail={(
          <>
            <LandingPrimaryActionRow onLoginClick={onLoginClick} />
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="landing-feature-card rounded-2xl px-4 py-4">
                <p className="landing-feature-eyebrow text-xs font-semibold uppercase tracking-[0.2em]">
                  Fokus
                </p>
                <p className="landing-feature-copy mt-2 text-sm leading-6">
                  General search dan semakan rekod tanpa paparan yang berserabut.
                </p>
              </div>
              <div className="landing-feature-card rounded-2xl px-4 py-4">
                <p className="landing-feature-eyebrow text-xs font-semibold uppercase tracking-[0.2em]">
                  Ketertiban
                </p>
                <p className="landing-feature-copy mt-2 text-sm leading-6">
                  Susun atur dibina untuk kerja dalaman yang berulang dan memerlukan ketepatan.
                </p>
              </div>
              <div className="landing-feature-card rounded-2xl px-4 py-4">
                <p className="landing-feature-eyebrow text-xs font-semibold uppercase tracking-[0.2em]">
                  Kawalan
                </p>
                <p className="landing-feature-copy mt-2 text-sm leading-6">
                  Akses sistem dikawal melalui log masuk dan semakan keselamatan yang berkaitan.
                </p>
              </div>
            </div>
          </>
        )}
        rightPane={(
          <div
            id="about"
            className="landing-secondary-pane landing-secondary-pane-shell rounded-[1.75rem] p-4 sm:p-5"
          >
            <div className="landing-about-shell landing-about-card rounded-[1.5rem] p-5 sm:p-6">
              <div className="landing-preview-topbar flex items-center justify-between gap-3 rounded-2xl px-4 py-3">
                <div>
                  <p className="landing-about-eyebrow text-xs font-semibold uppercase tracking-[0.24em]">
                    Paparan Kerja
                  </p>
                  <p className="landing-preview-topbar-copy mt-1 text-xs">
                    Susun atur yang padat untuk kerja operasi harian.
                  </p>
                </div>
                <div className="landing-preview-status rounded-full px-3 py-1 text-xs font-semibold">
                  Akses dalaman
                </div>
              </div>
              <h2 className="landing-about-title mt-5 text-2xl font-semibold tracking-tight">
                Satu paparan, carian dan semakan yang tersusun.
              </h2>
              <p className="landing-about-copy mt-3 text-sm leading-7">
                Antara muka dalaman ini diatur supaya pengguna boleh terus melihat status kerja,
                menyemak rekod, dan bergerak antara aliran tugas tanpa gangguan visual yang tidak
                perlu.
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="landing-preview-metric rounded-2xl px-4 py-4">
                  <p className="landing-preview-metric-label text-[11px] font-semibold uppercase tracking-[0.18em]">
                    Carian
                  </p>
                  <p className="landing-preview-metric-value mt-2 text-lg font-semibold">
                    General Search
                  </p>
                  <p className="landing-preview-metric-copy mt-2 text-xs leading-5">
                    Rujukan data utama kekal cepat dan mudah diimbas.
                  </p>
                </div>
                <div className="landing-preview-metric rounded-2xl px-4 py-4">
                  <p className="landing-preview-metric-label text-[11px] font-semibold uppercase tracking-[0.18em]">
                    Rekod
                  </p>
                  <p className="landing-preview-metric-value mt-2 text-lg font-semibold">
                    Semakan Teratur
                  </p>
                  <p className="landing-preview-metric-copy mt-2 text-xs leading-5">
                    Aliran kerja dibina untuk semakan berulang dan kemas kini pantas.
                  </p>
                </div>
                <div className="landing-preview-metric rounded-2xl px-4 py-4">
                  <p className="landing-preview-metric-label text-[11px] font-semibold uppercase tracking-[0.18em]">
                    Kawalan
                  </p>
                  <p className="landing-preview-metric-value mt-2 text-lg font-semibold">
                    Akses Berperanan
                  </p>
                  <p className="landing-preview-metric-copy mt-2 text-xs leading-5">
                    Setiap modul dilindungi ikut tugas dan tahap akses pengguna.
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                <p className="landing-about-eyebrow text-xs font-semibold uppercase tracking-[0.24em]">
                  Prinsip Reka Bentuk
                </p>
                {aboutHighlights.map((item) => (
                  <div
                    key={item}
                    className="landing-about-item flex items-start gap-3 rounded-2xl px-4 py-3"
                  >
                    <CheckCircle2 className="landing-about-item-icon mt-0.5 h-4 w-4 shrink-0" />
                    <p className="landing-about-item-copy text-sm leading-6">{item}</p>
                  </div>
                ))}
              </div>

              <div className="landing-about-note mt-5 rounded-2xl px-4 py-3 text-sm leading-6">
                Akses kekal terhad kepada pengguna berdaftar dan setiap aliran kerja direka supaya
                mudah dibaca, mudah dijejak, dan sesuai untuk operasi dalaman yang sensitif.
              </div>
            </div>
          </div>
        )}
      />

      <div ref={deferredSectionsTriggerRef} className="h-px w-full" aria-hidden="true" />

      {shouldLoadDeferredSections ? (
        <Suspense
          fallback={(
            <LandingDeferredSectionsFallback
              onLoginClick={onLoginClick}
              secondaryButtonClassName={landingSecondaryButtonClassName}
            />
          )}
        >
          <LandingDeferredSections
            onLoginClick={onLoginClick}
            secondaryButtonClassName={landingSecondaryButtonClassName}
          />
        </Suspense>
      ) : (
        <LandingDeferredSectionsFallback
          onLoginClick={onLoginClick}
          secondaryButtonClassName={landingSecondaryButtonClassName}
        />
      )}
    </LandingPageShell>
  );
}

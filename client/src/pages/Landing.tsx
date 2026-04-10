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
    }, 900);
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
            className="landing-secondary-pane landing-secondary-pane-shell rounded-3xl p-5 shadow-2xl shadow-black/20 backdrop-blur"
          >
            <div className="landing-about-shell landing-about-card rounded-2xl p-6">
              <p className="landing-about-eyebrow text-xs font-semibold uppercase tracking-[0.24em]">
                Tentang Sistem
              </p>
              <h2 className="landing-about-title mt-3 text-2xl font-semibold tracking-tight">
                Ruang kerja digital untuk semakan data yang lebih teratur.
              </h2>
              <p className="landing-about-copy mt-4 text-sm leading-7">
                Sistem ini dibangunkan untuk kegunaan operasi dalaman dengan keutamaan pada
                kelajuan carian, kebolehbacaan data, kawalan akses, dan aliran kerja yang
                membantu pengguna menumpukan kepada tugas sebenar tanpa gangguan yang tidak perlu.
              </p>
              <div className="mt-5 space-y-3">
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
              <div className="landing-about-note mt-4 rounded-2xl px-4 py-3 text-sm leading-6">
                Akses adalah terhad kepada pengguna berdaftar dan tertakluk kepada kawalan peranan
                serta dasar keselamatan sistem.
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

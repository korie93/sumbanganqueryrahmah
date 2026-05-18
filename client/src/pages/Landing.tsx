import { Suspense, useEffect, useRef, useState, type Ref } from "react";
import { LogIn } from "lucide-react";
import {
  LandingHeroShell,
  LandingPageShell,
  LandingPrimaryActionRow,
  landingSecondaryButtonClassName,
} from "@/pages/LandingHeroShell";
import { LandingHeroInsightStrip } from "@/pages/LandingHeroInsightStrip";
import { LandingProductPreview } from "@/pages/LandingProductPreview";
import { lazyWithPreload } from "@/lib/lazy-with-preload";

type LandingProps = {
  onLoginClick: () => void;
};

const LandingDeferredSections = lazyWithPreload(() => import("./LandingDeferredSections"));
const LANDING_DEFERRED_SECTION_ROOT_MARGIN = "0px";
const LANDING_DEFERRED_SECTION_THRESHOLD = 0.75;
const LANDING_DEFERRED_SECTION_FALLBACK_DELAY_MS = 2_500;

type LandingDeferredSectionsFallbackProps = {
  onLoginClick: () => void;
  secondaryButtonClassName: string;
  featuresRef?: Ref<HTMLElement>;
};

function LandingDeferredSectionsFallback({
  onLoginClick,
  secondaryButtonClassName,
  featuresRef,
}: LandingDeferredSectionsFallbackProps) {
  return (
    <>
      <section
        id="features"
        ref={featuresRef}
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
  const deferredSectionsTriggerRef = useRef<HTMLElement | null>(null);

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
          threshold: LANDING_DEFERRED_SECTION_THRESHOLD,
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
            <LandingHeroInsightStrip />
          </>
        )}
        rightPane={<LandingProductPreview />}
      />

      {shouldLoadDeferredSections ? (
        <Suspense
          fallback={(
            <LandingDeferredSectionsFallback
              onLoginClick={onLoginClick}
              secondaryButtonClassName={landingSecondaryButtonClassName}
              featuresRef={deferredSectionsTriggerRef}
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
          featuresRef={deferredSectionsTriggerRef}
        />
      )}
    </LandingPageShell>
  );
}

import { lazy, Suspense, useEffect, useRef } from "react";
import { LandingNavigationContext } from "./landing-v21/LandingLink";
import { AboutIntro, CoreWorkflowSection, HeroIntro, LandingCTA, LandingFooter, LandingNavigation, SecuritySection, WorkflowSection } from "./landing-v21/LandingSections";
import { ProductPreview } from "./landing-v21/ProductPreview";
import { TestimonialCarousel } from "./landing-v21/TestimonialCarousel";
import { useLandingMotion, useLandingSections } from "./landing-v21/useLandingMotion";
import "./landing-v21/landing-v21.css";

// Only the existing normal-profile branch requests this module and its CSS.
const LandingNext = lazy(() => import("@/pages/landing-next/LandingNext"));

export default function Landing({ onLoginClick }: { onLoginClick: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const motion = useLandingMotion();
  useLandingSections(root, motion.paused);
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    const target = [...(root.current?.querySelectorAll<HTMLElement>("[id]") ?? [])].find(element => element.id === id);
    target?.scrollIntoView({ block: "start", behavior: "instant" });
  }, []);
  if (!motion.lowSpec) {
    return (
      <Suspense fallback={<main id="main-content" className="grid min-h-screen place-content-center gap-4 bg-black p-6 text-center text-white" tabIndex={-1} aria-busy="true"><p role="status">Loading SQR…</p><a className="underline" href="/login" onClick={event => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault(); onLoginClick();
      }}>Log in</a></main>}>
        <LandingNext onLoginClick={onLoginClick} paused={motion.paused} />
      </Suspense>
    );
  }
  return (
    <LandingNavigationContext.Provider value={{ onLoginClick, reducedMotion: motion.paused }}>
    <div ref={root} className={`sqr-landing${motion.lowSpec ? " low-spec" : ""}${motion.touch ? " touch-ui" : ""}${motion.paused ? " motion-paused" : ""}`}>
      <LandingNavigation />
      <main id="main-content" tabIndex={-1}>
        <section className="hero" id="home"><div className="container"><HeroIntro /><ProductPreview motionPaused={motion.paused} /></div></section>
        <WorkflowSection />
        <CoreWorkflowSection />
        <SecuritySection />
        <section id="about"><div className="container"><div className="about-wrap"><AboutIntro /><TestimonialCarousel reducedMotion={motion.paused} /><LandingCTA /></div></div></section>
      </main>
      <LandingFooter />
    </div>
    </LandingNavigationContext.Provider>
  );
}

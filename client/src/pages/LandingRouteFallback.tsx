import {
  LandingHeroShell,
  LandingPageShell,
} from "@/pages/LandingHeroShell";

type LandingRouteFallbackProps = {
  onLoginClick: () => void;
};

export default function LandingRouteFallback({ onLoginClick }: LandingRouteFallbackProps) {
  return (
    <LandingPageShell onLoginClick={onLoginClick}>
      <LandingHeroShell
        leftDetail={(
          <>
            <div className="flex flex-wrap items-center gap-3" aria-hidden="true">
              <div className="landing-placeholder-line landing-placeholder-line--accent h-11 w-full max-w-[15rem] rounded-xl" />
              <div className="landing-placeholder-box h-11 w-full max-w-[22rem] rounded-xl" />
            </div>
            <div className="grid gap-3 sm:grid-cols-3" aria-hidden="true">
              <div className="landing-placeholder-card rounded-2xl px-4 py-4">
                <div className="landing-placeholder-line h-3 w-16 rounded-full" />
                <div className="landing-placeholder-line mt-3 h-3 w-full rounded-full" />
                <div className="landing-placeholder-line mt-2 h-3 w-4/5 rounded-full" />
              </div>
              <div className="landing-placeholder-card rounded-2xl px-4 py-4">
                <div className="landing-placeholder-line h-3 w-20 rounded-full" />
                <div className="landing-placeholder-line mt-3 h-3 w-full rounded-full" />
                <div className="landing-placeholder-line mt-2 h-3 w-3/4 rounded-full" />
              </div>
              <div className="landing-placeholder-card rounded-2xl px-4 py-4">
                <div className="landing-placeholder-line h-3 w-18 rounded-full" />
                <div className="landing-placeholder-line mt-3 h-3 w-full rounded-full" />
                <div className="landing-placeholder-line mt-2 h-3 w-4/5 rounded-full" />
              </div>
            </div>
          </>
        )}
        rightPane={(
          <div
            id="about"
            className="landing-secondary-pane landing-secondary-pane-shell rounded-3xl p-5 shadow-2xl shadow-black/20 backdrop-blur"
          >
            <div className="landing-about-shell landing-about-card space-y-3 rounded-2xl p-6" aria-hidden="true">
              <div className="landing-placeholder-line h-3 w-28 rounded-full" />
              <div className="landing-placeholder-line h-8 max-w-sm rounded-2xl" />
              <div className="landing-placeholder-line h-3 max-w-md rounded-full" />
              <div className="landing-placeholder-line h-3 max-w-lg rounded-full" />
              <div className="pt-2 space-y-3">
                <div className="landing-placeholder-box h-16 rounded-2xl" />
                <div className="landing-placeholder-box h-16 rounded-2xl" />
                <div className="landing-placeholder-box h-16 rounded-2xl" />
              </div>
              <div className="landing-placeholder-box h-16 rounded-2xl" />
            </div>
          </div>
        )}
      />
    </LandingPageShell>
  );
}

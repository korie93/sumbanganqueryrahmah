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
        onLoginClick={onLoginClick}
        leftDetail={(
          <>
            <div className="flex flex-wrap items-center gap-3" aria-hidden="true">
              <div className="h-11 w-full max-w-[15rem] rounded-xl border border-blue-400/20 bg-blue-400/10" />
              <div className="h-11 w-full max-w-[22rem] rounded-xl border border-white/10 bg-white/5" />
            </div>
            <div className="grid gap-3 sm:grid-cols-3" aria-hidden="true">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                <div className="h-3 w-16 rounded-full bg-white/10" />
                <div className="mt-3 h-3 w-full rounded-full bg-white/10" />
                <div className="mt-2 h-3 w-4/5 rounded-full bg-white/10" />
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                <div className="h-3 w-20 rounded-full bg-white/10" />
                <div className="mt-3 h-3 w-full rounded-full bg-white/10" />
                <div className="mt-2 h-3 w-3/4 rounded-full bg-white/10" />
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                <div className="h-3 w-18 rounded-full bg-white/10" />
                <div className="mt-3 h-3 w-full rounded-full bg-white/10" />
                <div className="mt-2 h-3 w-4/5 rounded-full bg-white/10" />
              </div>
            </div>
          </>
        )}
        rightPane={(
          <div
            id="about"
            className="landing-secondary-pane rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/20 backdrop-blur"
          >
            <div className="landing-about-card space-y-3 rounded-2xl border border-white/10 bg-slate-900/80 p-6" aria-hidden="true">
              <div className="h-3 w-28 rounded-full bg-white/10" />
              <div className="h-8 max-w-sm rounded-2xl bg-white/10" />
              <div className="h-3 max-w-md rounded-full bg-white/10" />
              <div className="h-3 max-w-lg rounded-full bg-white/10" />
              <div className="pt-2 space-y-3">
                <div className="h-16 rounded-2xl border border-white/10 bg-white/5" />
                <div className="h-16 rounded-2xl border border-white/10 bg-white/5" />
                <div className="h-16 rounded-2xl border border-white/10 bg-white/5" />
              </div>
              <div className="h-16 rounded-2xl border border-white/10 bg-white/5" />
            </div>
          </div>
        )}
      />
    </LandingPageShell>
  );
}

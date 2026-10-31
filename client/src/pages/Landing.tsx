import { lazy, Suspense } from "react";

// Every device receives the same public landing and its route-owned motion.
const LandingNext = lazy(() => import("@/pages/landing-next/LandingNext"));

export default function Landing({ onLoginClick }: { onLoginClick: () => void }) {
  return (
    <Suspense fallback={<main id="main-content" className="grid min-h-screen place-content-center gap-4 bg-black p-6 text-center text-white" tabIndex={-1} aria-busy="true"><p role="status">Loading SQR…</p><a className="underline" href="/login" onClick={event => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault(); onLoginClick();
      }}>Log in</a></main>}>
      <LandingNext onLoginClick={onLoginClick} />
    </Suspense>
  );
}

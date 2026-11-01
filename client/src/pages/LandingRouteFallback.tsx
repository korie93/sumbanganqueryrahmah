import { SQR_BRAND_ASSETS } from "@shared/brand-assets";
import "./LandingRouteFallback.css";

export default function LandingRouteFallback(_props: { onLoginClick: () => void }) {
  return (
    <main id="main-content" tabIndex={-1} className="landing-route-fallback" aria-busy="true">
      <div className="landing-route-fallback__status" role="status" aria-live="polite" aria-atomic="true">
        <img src={SQR_BRAND_ASSETS.transparentIcon} width={44} height={44} alt="" aria-hidden="true" decoding="async" />
        <h1>Loading SQR…</h1>
      </div>
    </main>
  );
}

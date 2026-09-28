import "./LandingRouteFallback.css";

export default function LandingRouteFallback({ onLoginClick }: { onLoginClick: () => void }) {
  return (
    <main id="main-content" tabIndex={-1} className="landing-route-fallback" aria-busy="true">
      <p>SQR Operations Platform</p>
      <h1>Operational data, structured<br />for faster decisions.</h1>
      <p>SQR consolidates search, analysis, monitoring and access control into a single operational workspace designed for clarity, speed and governance.</p>
      <a href="/login" onClick={event => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault(); onLoginClick();
      }}>Sign In</a>
    </main>
  );
}

import LandingNext from "@/pages/landing-next/LandingNext";

// The route registry owns lazy loading. Keep its complete public page in one
// dependency graph so build hints can discover the landing's scripts and CSS.

export default function Landing({ onLoginClick }: { onLoginClick: () => void }) {
  return <LandingNext onLoginClick={onLoginClick} />;
}

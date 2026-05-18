import { CalendarDays, Search, ShieldCheck } from "lucide-react";

const landingHeroInsights = [
  {
    title: "Cari rekod",
    description: "General search untuk rujukan pantas.",
    icon: Search,
  },
  {
    title: "Semak harian",
    description: "Collection Daily dan status operasi.",
    icon: CalendarDays,
  },
  {
    title: "Kawal akses",
    description: "Peranan, audit, dan keselamatan.",
    icon: ShieldCheck,
  },
];

export function LandingHeroInsightStrip() {
  return (
    <div
      className="landing-insight-strip grid gap-2 sm:grid-cols-3"
      role="list"
      aria-label="Ringkasan fungsi utama"
    >
      {landingHeroInsights.map((item) => (
        <div
          key={item.title}
          role="listitem"
          className="landing-insight-item flex items-start gap-3 rounded-2xl px-3 py-3"
        >
          <span className="landing-insight-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
            <item.icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="landing-insight-title block text-sm font-semibold">{item.title}</span>
            <span className="landing-insight-copy mt-1 block text-xs leading-5">{item.description}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

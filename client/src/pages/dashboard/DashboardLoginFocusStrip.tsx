import { memo } from "react";
import type { LucideIcon } from "lucide-react";
import { Activity, BarChart3, Gauge, ListChecks, ShieldAlert, ShieldCheck } from "lucide-react";

interface DashboardLoginFocusItem {
  description: string;
  href: string;
  icon: LucideIcon;
  label: string;
}

const DASHBOARD_LOGIN_FOCUS_ITEMS: readonly DashboardLoginFocusItem[] = [
  {
    description: "Status dan tindakan utama",
    href: "#dashboard-login-priority",
    icon: ShieldCheck,
    label: "Status",
  },
  {
    description: "Keputusan mudah dibaca",
    href: "#dashboard-login-situation-summary",
    icon: ListChecks,
    label: "Summary",
  },
  {
    description: "User, IP, masa dan sebab",
    href: "#dashboard-suspicious-login-watchlist",
    icon: ShieldAlert,
    label: "Amaran",
  },
  {
    description: "KPI akses utama",
    href: "#dashboard-login-snapshot",
    icon: Gauge,
    label: "Snapshot",
  },
  {
    description: "Rekod login terbaru",
    href: "#dashboard-recent-login-activity",
    icon: Activity,
    label: "Aktiviti",
  },
  {
    description: "Trend dan waktu puncak",
    href: "#dashboard-login-charts",
    icon: BarChart3,
    label: "Carta",
  },
] as const;

function DashboardLoginFocusStripImpl() {
  return (
    <nav
      className="rounded-2xl border border-border/60 bg-background p-2 shadow-sm"
      aria-label="Dashboard login focus navigation"
      data-floating-ai-avoid="true"
      data-testid="dashboard-login-focus-strip"
    >
      <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
        <p className="sticky left-0 z-10 shrink-0 rounded-xl bg-background px-2 py-2 text-xs font-semibold uppercase tracking-label-md text-muted-foreground">
          Jump to
        </p>
        {DASHBOARD_LOGIN_FOCUS_ITEMS.map((item) => {
          const Icon = item.icon;

          return (
            <a
              key={item.href}
              href={item.href}
              className="group inline-flex min-w-[8.25rem] shrink-0 items-center gap-2 rounded-xl border border-border/60 bg-muted/10 px-3 py-2 text-left text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background text-primary">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-semibold text-foreground">{item.label}</span>
                <span className="block truncate text-xxs leading-4 text-muted-foreground">{item.description}</span>
              </span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}

export const DashboardLoginFocusStrip = memo(DashboardLoginFocusStripImpl);

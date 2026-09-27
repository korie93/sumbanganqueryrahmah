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
      className="dashboard-focus-navigation"
      aria-label="Dashboard login focus navigation"
      data-floating-ai-avoid="true"
      data-testid="dashboard-login-focus-strip"
    >
      <div className="flex flex-wrap items-center gap-1">
        <p className="shrink-0 px-2 text-xs font-medium text-muted-foreground">
          Jump to
        </p>
        {DASHBOARD_LOGIN_FOCUS_ITEMS.map((item) => {
          const Icon = item.icon;

          return (
            <a
              key={item.href}
              href={item.href}
              className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md px-2 py-2 text-left text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9"
            >
              <span className="inline-flex shrink-0 items-center justify-center text-muted-foreground">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-semibold text-foreground">{item.label}</span>
                <span className="sr-only">{item.description}</span>
              </span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}

export const DashboardLoginFocusStrip = memo(DashboardLoginFocusStripImpl);

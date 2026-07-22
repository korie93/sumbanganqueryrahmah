import { memo, useMemo } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Globe2,
  MonitorSmartphone,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardSectionError } from "@/pages/dashboard/DashboardSectionError";
import type { RecentLoginActivity } from "@/pages/dashboard/types";
import {
  formatDashboardRecentLoginTime,
  isDashboardRecentLoginAttentionActivity,
} from "@/pages/dashboard/utils";

type SuspiciousLoginTone = "danger" | "info" | "warning";

export interface DashboardSuspiciousLoginItem {
  activity: RecentLoginActivity;
  deviceLabel: string;
  eventTime: string | null;
  eventTimeLabel: string;
  networkLabel: string;
  reasonLabel: string;
  severityLabel: string;
  tone: SuspiciousLoginTone;
}

interface DashboardSuspiciousLoginWatchlistProps {
  activities: readonly RecentLoginActivity[] | undefined;
  canOpenFullAudit: boolean;
  canViewExactNetwork: boolean;
  errorMessage: string | null;
  loading: boolean;
  onInvestigate: (activity: RecentLoginActivity) => void;
  onRetry: () => void;
  retrying: boolean;
  totalItems: number;
}

const WATCHLIST_MAX_ITEMS = 4;
const RESTRICTED_REASON_PATTERN = /banned|blocked|locked/i;
const FORCED_REASON_PATTERN = /forced|kicked|revoked/i;
const TIMEOUT_REASON_PATTERN = /expired|idle|timeout/i;
const FAILURE_REASON_LABELS: Readonly<Record<string, string>> = {
  account_banned: "Akaun telah disekat",
  account_disabled: "Akaun tidak aktif",
  account_locked: "Akaun telah dikunci",
  invalid_code: "Pengesahan dua faktor gagal",
  invalid_password: "Kata laluan tidak sah",
  user_not_found: "Nama pengguna tidak dikenali",
};

const TONE_CLASS_BY_TONE: Record<SuspiciousLoginTone, string> = {
  danger: "border-rose-500/50 bg-rose-500/10 text-rose-800 dark:text-rose-200",
  info: "border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-200",
  warning: "border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200",
};

function normalizeReasonLabel(value: string | null | undefined) {
  const normalized = value
    ?.replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  if (!normalized) {
    return null;
  }

  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function resolveDashboardSuspiciousLoginEventTime(activity: RecentLoginActivity) {
  if (activity.status === "failed") {
    return activity.loginTime ?? activity.lastActivityTime ?? activity.logoutTime;
  }

  return activity.logoutTime ?? activity.lastActivityTime ?? activity.loginTime;
}

function resolveDashboardSuspiciousLoginReason(activity: RecentLoginActivity) {
  const normalizedFailureReason = activity.failureReason?.trim().toLowerCase();
  if (activity.status === "failed") {
    return (
      (normalizedFailureReason ? FAILURE_REASON_LABELS[normalizedFailureReason] : null)
      ?? "Cubaan login ditolak"
    );
  }

  return normalizeReasonLabel(activity.logoutReason) ?? "Aktiviti memerlukan semakan";
}

function resolveDashboardSuspiciousLoginSeverity(activity: RecentLoginActivity) {
  const reason = `${activity.failureReason ?? ""} ${activity.logoutReason ?? ""}`;

  if (RESTRICTED_REASON_PATTERN.test(reason)) {
    return { label: "Keutamaan tinggi", tone: "danger" as const };
  }
  if (activity.status === "failed" || FORCED_REASON_PATTERN.test(reason)) {
    return { label: "Perlu semakan", tone: "warning" as const };
  }
  if (TIMEOUT_REASON_PATTERN.test(reason)) {
    return { label: "Pantau", tone: "info" as const };
  }

  return { label: "Perlu semakan", tone: "warning" as const };
}

function resolveDashboardSuspiciousLoginDevice(activity: RecentLoginActivity) {
  const browser = activity.browser?.trim();
  const platform = activity.platform?.trim();

  if (browser && platform) {
    return `${browser} / ${platform}`;
  }

  return browser || platform || "Peranti tidak direkod";
}

function parseEventTimeMs(value: string | null) {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildDashboardSuspiciousLoginItems(
  activities: readonly RecentLoginActivity[] | undefined,
): DashboardSuspiciousLoginItem[] {
  return (activities ?? [])
    .filter(isDashboardRecentLoginAttentionActivity)
    .map((activity) => {
      const eventTime = resolveDashboardSuspiciousLoginEventTime(activity);
      const severity = resolveDashboardSuspiciousLoginSeverity(activity);

      return {
        activity,
        deviceLabel: resolveDashboardSuspiciousLoginDevice(activity),
        eventTime,
        eventTimeLabel: formatDashboardRecentLoginTime(eventTime),
        networkLabel: activity.ipAddress?.trim() || "IP tidak direkod",
        reasonLabel: resolveDashboardSuspiciousLoginReason(activity),
        severityLabel: severity.label,
        tone: severity.tone,
      };
    })
    .sort((left, right) => parseEventTimeMs(right.eventTime) - parseEventTimeMs(left.eventTime))
    .slice(0, WATCHLIST_MAX_ITEMS);
}

function DashboardSuspiciousLoginWatchlistSkeleton() {
  return (
    <section
      className="scroll-mt-24 rounded-2xl border border-border/60 bg-background p-3 shadow-sm sm:p-4"
      role="status"
      aria-label="Memuatkan aktiviti login yang perlu disiasat"
      data-floating-ai-avoid="true"
    >
      <div className="h-5 w-52 animate-pulse rounded bg-slate-200/80 dark:bg-muted" aria-hidden="true" />
      <div className="mt-4 grid gap-2">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-xl bg-slate-200/60 dark:bg-muted" aria-hidden="true" />
        ))}
      </div>
      <span className="sr-only">Memuatkan aktiviti login yang perlu disiasat</span>
    </section>
  );
}

function DashboardSuspiciousLoginWatchlistImpl({
  activities,
  canOpenFullAudit,
  canViewExactNetwork,
  errorMessage,
  loading,
  onInvestigate,
  onRetry,
  retrying,
  totalItems,
}: DashboardSuspiciousLoginWatchlistProps) {
  const items = useMemo(() => buildDashboardSuspiciousLoginItems(activities), [activities]);

  if (loading) {
    return <DashboardSuspiciousLoginWatchlistSkeleton />;
  }

  return (
    <section
      id="dashboard-suspicious-login-watchlist"
      className="scroll-mt-24 rounded-2xl border border-border/60 bg-background p-3 shadow-sm sm:p-4"
      aria-labelledby="dashboard-suspicious-login-title"
      data-floating-ai-avoid="true"
      data-testid="dashboard-suspicious-login-watchlist"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-label-md text-muted-foreground">
            Security Watchlist
          </p>
          <h2 id="dashboard-suspicious-login-title" className="mt-1 text-base font-semibold text-foreground">
            Aktiviti login yang perlu disiasat
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
            Semak siapa, alamat rangkaian, masa dan sebab. Signal ini memerlukan pengesahan operator dan bukan bukti kompromi secara automatik.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Badge
            variant={totalItems > 0 ? "outline" : "secondary"}
            className={totalItems > 0 ? "rounded-full border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200" : "rounded-full"}
            aria-label={`${totalItems.toLocaleString()} login activities need review`}
          >
            {totalItems > 0 ? `${totalItems.toLocaleString()} perlu semakan` : "Tiada amaran"}
          </Badge>
          {canOpenFullAudit ? (
            <Button asChild variant="outline" size="sm" className="rounded-lg">
              <a href="/monitor?section=activity">
                Audit penuh
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </a>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-4">
        {errorMessage ? (
          <DashboardSectionError
            title="Watchlist login gagal dimuat"
            description={errorMessage}
            onRetry={onRetry}
            retrying={retrying}
            minHeightClassName="min-h-[140px]"
          />
        ) : items.length > 0 ? (
          <div className="grid gap-2" role="list" aria-label="Aktiviti login yang memerlukan semakan">
            {items.map((item, index) => (
              <article
                key={item.activity.id ?? `${item.activity.username}:${item.eventTime ?? "unknown"}:${index}`}
                className="grid min-w-0 gap-3 rounded-xl border border-border/60 bg-muted/10 p-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(10rem,0.9fr)_minmax(12rem,1fr)_auto] lg:items-center"
                role="listitem"
                aria-label={`${item.severityLabel}: ${item.activity.username}, ${item.networkLabel}, ${item.eventTimeLabel}, ${item.reasonLabel}`}
                data-testid={`dashboard-suspicious-login-row-${index}`}
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-start gap-2">
                    <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${TONE_CLASS_BY_TONE[item.tone]}`}>
                      {item.tone === "danger" ? (
                        <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold text-foreground">{item.activity.username}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className={`rounded-full text-2xs ${TONE_CLASS_BY_TONE[item.tone]}`}>
                          {item.severityLabel}
                        </Badge>
                        <Badge variant="outline" className="rounded-full text-2xs capitalize">
                          {item.activity.role}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="min-w-0 space-y-1.5 text-xs">
                  <p className="flex min-w-0 items-start gap-2 text-muted-foreground">
                    <Globe2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block text-2xs font-medium uppercase tracking-label-sm">
                        {canViewExactNetwork ? "Alamat IP" : "Rangkaian (dimask)"}
                      </span>
                      <span className="mt-0.5 block break-all font-semibold text-foreground" data-export-sensitive="true">
                        {item.networkLabel}
                      </span>
                    </span>
                  </p>
                  <p className="flex min-w-0 items-start gap-2 text-muted-foreground">
                    <MonitorSmartphone className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 break-words">{item.deviceLabel}</span>
                  </p>
                </div>

                <div className="min-w-0 space-y-1.5 text-xs">
                  <p className="flex min-w-0 items-start gap-2 text-muted-foreground">
                    <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block text-2xs font-medium uppercase tracking-label-sm">Tarikh dan waktu</span>
                      <time className="mt-0.5 block break-words font-semibold text-foreground" dateTime={item.eventTime ?? undefined}>
                        {item.eventTimeLabel}
                      </time>
                    </span>
                  </p>
                  <p className="flex min-w-0 items-start gap-2 text-muted-foreground">
                    <UserRound className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 break-words">
                      Sebab: <span className="font-medium text-foreground">{item.reasonLabel}</span>
                    </span>
                  </p>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full justify-center rounded-lg lg:w-auto"
                  onClick={() => onInvestigate(item.activity)}
                  aria-label={`Semak rekod login untuk ${item.activity.username}`}
                >
                  Semak rekod
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Button>
              </article>
            ))}
          </div>
        ) : (
          <div
            className="flex min-h-[120px] items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-800 dark:text-emerald-200"
            role="status"
          >
            <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">Tiada aktiviti yang memerlukan semakan</p>
              <p className="mt-1 text-xs leading-5">Tiada cubaan gagal atau penamatan sesi luar biasa dalam rekod watchlist semasa.</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export const DashboardSuspiciousLoginWatchlist = memo(DashboardSuspiciousLoginWatchlistImpl);

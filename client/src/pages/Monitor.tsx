import { Suspense, lazy, startTransition, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { MonitorAccessDenied } from "@/components/monitor/MonitorAccessDenied";
import { MonitorOverviewSection } from "@/components/monitor/MonitorOverviewSection";
import { MonitorStatusBanners } from "@/components/monitor/MonitorStatusBanners";
import {
  buildMonitorChaosCompactSummary,
  buildMonitorChaosSummaryFacts,
} from "@/components/monitor/monitor-chaos-utils";
import {
  buildMonitorInsightsCompactSummary,
  buildMonitorInsightsSummaryFacts,
} from "@/components/monitor/monitor-insights-utils";
import {
  buildMonitorMetricsCompactSummary,
  buildMonitorMetricsSummaryFacts,
} from "@/components/monitor/monitor-metrics-summary-utils";
import {
  buildMonitorTechnicalCompactSummary,
  buildMonitorTechnicalSummaryFacts,
} from "@/components/monitor/monitor-technical-summary-utils";
import {
  buildMonitorWebVitalCompactSummary,
  buildMonitorWebVitalSummaryFacts,
} from "@/components/monitor/monitor-web-vitals-utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CHAOS_OPTIONS,
  buildMetricGroups,
  buildRollupFreshnessSummary,
  formatMonitorDurationCompact,
  getModeBadgeClass,
  getRollupFreshnessBadgeClass,
  getRollupFreshnessStatus,
  getScoreStatus,
} from "@/components/monitor/monitorData";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSystemMetrics } from "@/hooks/useSystemMetrics";
import { useToast } from "@/hooks/use-toast";
import {
  autoHealRollupQueue,
  deleteOldAlertHistory,
  drainRollupQueue,
  type ChaosType,
  injectChaos,
  rebuildCollectionRollups,
  retryRollupFailures,
} from "@/lib/api";
import { getStoredRole } from "@/lib/auth-session";

const MonitorAlertsSection = lazy(() =>
  import("@/components/monitor/MonitorAlertsSection").then((module) => ({
    default: module.MonitorAlertsSection,
  })),
);
const MonitorMetricsSection = lazy(() =>
  import("@/components/monitor/MonitorMetricsSection").then((module) => ({
    default: module.MonitorMetricsSection,
  })),
);
const MonitorChaosSection = lazy(() =>
  import("@/components/monitor/MonitorChaosSection").then((module) => ({
    default: module.MonitorChaosSection,
  })),
);
const MonitorRollupQueueControlsSection = lazy(() =>
  import("@/components/monitor/MonitorRollupQueueControlsSection").then((module) => ({
    default: module.MonitorRollupQueueControlsSection,
  })),
);
const MonitorTechnicalChartsSection = lazy(() =>
  import("@/components/monitor/MonitorTechnicalChartsSection").then((module) => ({
    default: module.MonitorTechnicalChartsSection,
  })),
);
const MonitorInsightsSection = lazy(() =>
  import("@/components/monitor/MonitorInsightsSection").then((module) => ({
    default: module.MonitorInsightsSection,
  })),
);
const MonitorWebVitalsSection = lazy(() =>
  import("@/components/monitor/MonitorWebVitalsSection").then((module) => ({
    default: module.MonitorWebVitalsSection,
  })),
);

const ALERT_HISTORY_PAGE_SIZE = 5;
const ACTIVE_ALERTS_PAGE_SIZE = 5;

function getMonitorSummaryToneClass(tone: "stable" | "watch" | "attention") {
  if (tone === "attention") {
    return "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300";
  }

  if (tone === "watch") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }

  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
}

function MonitorChartsFallback() {
  return (
    <section
      className="rounded-2xl border border-border/60 bg-slate-200/40 p-4 dark:bg-slate-900/60"
      role="status"
      aria-live="polite"
      aria-label="Loading technical charts"
    >
      <div className="mb-3 h-6 w-48 animate-pulse rounded bg-slate-300/70 dark:bg-slate-700/70" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-64 animate-pulse rounded-xl bg-slate-300/60 dark:bg-slate-800/70"
          />
        ))}
      </div>
    </section>
  );
}

function MonitorInsightsFallback() {
  return (
    <section
      className="space-y-4 rounded-2xl border border-border/60 bg-background/30 p-4 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-label="Loading intelligence insights"
    >
      <div className="space-y-2">
        <div className="h-6 w-56 animate-pulse rounded bg-slate-300/70 dark:bg-slate-700/70" />
        <div className="h-4 w-full max-w-2xl animate-pulse rounded bg-slate-300/60 dark:bg-slate-800/70" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="h-32 animate-pulse rounded-xl bg-slate-300/60 dark:bg-slate-800/70"
          />
        ))}
      </div>
    </section>
  );
}

function MonitorMetricsFallback() {
  return (
    <section
      className="space-y-4"
      role="status"
      aria-live="polite"
      aria-label="Loading key metrics"
    >
      <div className="space-y-2">
        <div className="h-6 w-40 animate-pulse rounded bg-slate-300/70 dark:bg-slate-700/70" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded bg-slate-300/60 dark:bg-slate-800/70" />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-72 animate-pulse rounded-2xl border border-border/60 bg-background/35 backdrop-blur-sm"
          />
        ))}
      </div>
    </section>
  );
}

function MonitorSectionCardFallback({
  title,
  blocks = 2,
}: {
  title: string;
  blocks?: number;
}) {
  return (
    <section
      className="rounded-2xl border border-border/60 bg-background/30 p-4 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-label={title}
    >
      <div className="mb-3 h-5 w-40 animate-pulse rounded bg-slate-300/70 dark:bg-slate-700/70" />
      <div className="space-y-3">
        {Array.from({ length: blocks }).map((_, index) => (
          <div
            key={index}
            className="h-20 animate-pulse rounded-xl bg-slate-300/60 dark:bg-slate-800/70"
          />
        ))}
      </div>
    </section>
  );
}

function MonitorWebVitalsInlineFallback() {
  return (
    <div
      className="space-y-3 rounded-2xl border border-border/60 bg-background/35 p-4"
      role="status"
      aria-live="polite"
      aria-label="Loading real user experience details"
    >
      <div className="h-5 w-48 animate-pulse rounded bg-slate-300/70 dark:bg-slate-700/70" />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div
            key={index}
            className="h-36 animate-pulse rounded-2xl bg-slate-300/60 dark:bg-slate-800/70"
          />
        ))}
      </div>
    </div>
  );
}

type DeferredMonitorSectionOptions = {
  enabled: boolean;
  rootMargin?: string;
  timeoutMs?: number;
};

function useDeferredMonitorSectionMount({
  enabled,
  rootMargin = "320px 0px",
  timeoutMs = 1400,
}: DeferredMonitorSectionOptions) {
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const [shouldRender, setShouldRender] = useState(() => !enabled);

  useEffect(() => {
    if (!enabled) {
      setShouldRender(true);
      return;
    }

    if (shouldRender) {
      return;
    }

    let cancelled = false;
    let observer: IntersectionObserver | null = null;
    let timeoutHandle: number | null = null;

    const markReady = () => {
      if (cancelled) {
        return;
      }

      startTransition(() => {
        setShouldRender(true);
      });
    };

    if (typeof window.IntersectionObserver === "function" && triggerRef.current) {
      observer = new window.IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) {
            return;
          }

          observer?.disconnect();
          observer = null;
          markReady();
        },
        {
          rootMargin,
        },
      );
      observer.observe(triggerRef.current);
    } else {
      timeoutHandle = window.setTimeout(markReady, timeoutMs);
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
      observer = null;
      if (timeoutHandle !== null) {
        window.clearTimeout(timeoutHandle);
      }
    };
  }, [enabled, rootMargin, shouldRender, timeoutMs]);

  return { shouldRender, triggerRef };
}

function MonitorDeferredSectionToggle({
  title,
  headline,
  description,
  statusBadgeLabel,
  statusTone,
  summaryBadges,
  open,
  onToggle,
}: {
  title: string;
  headline?: string;
  description: string;
  statusBadgeLabel?: string;
  statusTone?: "stable" | "watch" | "attention";
  summaryBadges?: ReactNode;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/30 p-4 backdrop-blur-sm">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 text-left"
        onClick={onToggle}
        aria-expanded={open}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            {statusBadgeLabel ? (
              <Badge
                variant="outline"
                className={`rounded-full px-2.5 py-0.5 text-[10px] ${getMonitorSummaryToneClass(
                  statusTone ?? "stable",
                )}`}
              >
                {statusBadgeLabel}
              </Badge>
            ) : null}
            {summaryBadges}
          </div>
          {headline ? <p className="mt-2 text-sm font-semibold text-foreground">{headline}</p> : null}
          <p className={headline ? "mt-1 text-sm text-muted-foreground" : "mt-2 text-sm text-muted-foreground"}>
            {description}
          </p>
        </div>
        <span className="shrink-0 pt-1 text-muted-foreground">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>
    </div>
  );
}

export default function Monitor() {
  const isMobile = useIsMobile();
  const initialCompactViewport = typeof window !== "undefined" && window.innerWidth < 768;
  const [metricsOpen, setMetricsOpen] = useState(() => !initialCompactViewport);
  const [alertsOpen, setAlertsOpen] = useState(() => !initialCompactViewport);
  const [alertHistoryOpen, setAlertHistoryOpen] = useState(false);
  const [alertsPage, setAlertsPage] = useState(1);
  const [alertHistoryPage, setAlertHistoryPage] = useState(1);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [chaosType, setChaosType] = useState<ChaosType>("cpu_spike");
  const [chaosMagnitude, setChaosMagnitude] = useState(String(CHAOS_OPTIONS[0].defaultMagnitude));
  const [chaosDurationMs, setChaosDurationMs] = useState(String(CHAOS_OPTIONS[0].defaultDurationMs));
  const [chaosLoading, setChaosLoading] = useState(false);
  const [lastChaosMessage, setLastChaosMessage] = useState<string | null>(null);
  const [webVitalsOpen, setWebVitalsOpen] = useState(false);
  const [chaosSectionOpen, setChaosSectionOpen] = useState(false);
  const [technicalChartsOpen, setTechnicalChartsOpen] = useState(false);
  const [deleteAlertHistoryBusy, setDeleteAlertHistoryBusy] = useState(false);
  const [queueActionBusy, setQueueActionBusy] = useState<"drain" | "retry-failures" | "auto-heal" | "rebuild" | null>(null);
  const [lastQueueActionMessage, setLastQueueActionMessage] = useState<string | null>(null);
  const chaosRequestRef = useRef<AbortController | null>(null);
  const chaosInFlightRef = useRef(false);
  const deleteAlertHistoryRequestRef = useRef<AbortController | null>(null);
  const deleteAlertHistoryInFlightRef = useRef(false);
  const queueActionRequestRef = useRef<AbortController | null>(null);
  const queueActionInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const { toast } = useToast();
  const includeMonitorHistory = metricsOpen || technicalChartsOpen;
  const {
    isLoading,
    snapshot,
    history,
    alerts,
    alertsPagination,
    alertHistory,
    alertHistoryPagination,
    intelligence,
    webVitalsOverview,
    accessDenied,
    hasNetworkFailure,
    lastUpdated,
    refreshNow,
  } = useSystemMetrics({
    includeHistory: includeMonitorHistory,
    includeAlerts: alertsOpen,
    alertsPage,
    alertsPageSize: ACTIVE_ALERTS_PAGE_SIZE,
    includeAlertHistory: alertsOpen && alertHistoryOpen,
    alertHistoryPage,
    alertHistoryPageSize: ALERT_HISTORY_PAGE_SIZE,
    includeIntelligence: insightsOpen,
    includeWebVitalsOverview: webVitalsOpen,
  });

  const userRole = useMemo(() => getStoredRole(), []);

  const canInjectChaos = userRole === "admin" || userRole === "superuser";
  const canDeleteAlertHistory = userRole === "superuser";
  const canManageRollups = userRole === "superuser";
  const deferSecondaryMobileSections = initialCompactViewport;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      chaosRequestRef.current?.abort();
      chaosRequestRef.current = null;
      chaosInFlightRef.current = false;
      deleteAlertHistoryRequestRef.current?.abort();
      deleteAlertHistoryRequestRef.current = null;
      deleteAlertHistoryInFlightRef.current = false;
      queueActionRequestRef.current?.abort();
      queueActionRequestRef.current = null;
      queueActionInFlightRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!accessDenied) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === "/403") return;
    window.location.assign("/403");
  }, [accessDenied]);

  const selectedChaosProfile = useMemo(
    () => CHAOS_OPTIONS.find((option) => option.type === chaosType) || CHAOS_OPTIONS[0],
    [chaosType],
  );
  const scoreStatus = useMemo(() => getScoreStatus(snapshot.score), [snapshot.score]);
  const modeBadgeClass = useMemo(() => getModeBadgeClass(snapshot.mode), [snapshot.mode]);
  const rollupFreshnessStatus = useMemo(() => getRollupFreshnessStatus(snapshot), [snapshot]);
  const rollupFreshnessBadgeClass = useMemo(
    () => getRollupFreshnessBadgeClass(rollupFreshnessStatus),
    [rollupFreshnessStatus],
  );
  const rollupFreshnessSummary = useMemo(() => buildRollupFreshnessSummary(snapshot), [snapshot]);
  const rollupFreshnessAgeLabel = useMemo(
    () => formatMonitorDurationCompact(snapshot.rollupRefreshOldestPendingAgeMs),
    [snapshot.rollupRefreshOldestPendingAgeMs],
  );
  const webVitalsCompactSummary = useMemo(
    () => buildMonitorWebVitalCompactSummary(webVitalsOverview),
    [webVitalsOverview],
  );
  const metricsCompactSummary = useMemo(
    () => buildMonitorMetricsCompactSummary(snapshot),
    [snapshot],
  );
  const metricsSummaryFacts = useMemo(
    () => buildMonitorMetricsSummaryFacts(snapshot),
    [snapshot],
  );
  const chaosCompactSummary = useMemo(
    () =>
      buildMonitorChaosCompactSummary({
        canInjectChaos,
        selectedChaosProfile,
        chaosDurationMs,
        chaosLoading,
        lastChaosMessage,
      }),
    [canInjectChaos, chaosDurationMs, chaosLoading, lastChaosMessage, selectedChaosProfile],
  );
  const chaosSummaryFacts = useMemo(
    () =>
      buildMonitorChaosSummaryFacts({
        canInjectChaos,
        selectedChaosProfile,
        chaosDurationMs,
        chaosLoading,
      }),
    [canInjectChaos, chaosDurationMs, chaosLoading, selectedChaosProfile],
  );
  const technicalCompactSummary = useMemo(
    () => buildMonitorTechnicalCompactSummary(snapshot),
    [snapshot],
  );
  const technicalSummaryFacts = useMemo(
    () => buildMonitorTechnicalSummaryFacts(snapshot),
    [snapshot],
  );
  const insightsCompactSummary = useMemo(
    () => buildMonitorInsightsCompactSummary(intelligence),
    [intelligence],
  );
  const insightsSummaryFacts = useMemo(
    () => buildMonitorInsightsSummaryFacts(intelligence),
    [intelligence],
  );
  const webVitalsSummaryFacts = useMemo(
    () => buildMonitorWebVitalSummaryFacts(webVitalsOverview),
    [webVitalsOverview],
  );
  const webVitalsSummaryLabel = useMemo(() => {
    const suffix = webVitalsOpen
      ? ""
      : " Open Information only when you need deeper browser experience detail.";

    if (!webVitalsOpen) {
      return `${webVitalsCompactSummary.description}${suffix}`;
    }

    if (webVitalsOverview.totalSamples === 0) {
      return webVitalsCompactSummary.description;
    }

    return webVitalsCompactSummary.description;
  }, [webVitalsCompactSummary.description, webVitalsOpen, webVitalsOverview.totalSamples]);
  const metricGroups = useMemo(
    () => (metricsOpen ? buildMetricGroups(snapshot, history) : []),
    [history, metricsOpen, snapshot],
  );
  const { shouldRender: shouldRenderRollupControls, triggerRef: rollupControlsTriggerRef } =
    useDeferredMonitorSectionMount({ enabled: deferSecondaryMobileSections && canManageRollups });
  const { shouldRender: shouldRenderAlerts, triggerRef: alertsTriggerRef } =
    useDeferredMonitorSectionMount({ enabled: deferSecondaryMobileSections });

  useEffect(() => {
    if (alertsPage > alertsPagination.totalPages) {
      setAlertsPage(alertsPagination.totalPages);
    }
  }, [alertsPage, alertsPagination.totalPages]);

  useEffect(() => {
    if (alertHistoryPage > alertHistoryPagination.totalPages) {
      setAlertHistoryPage(alertHistoryPagination.totalPages);
    }
  }, [alertHistoryPage, alertHistoryPagination.totalPages]);

  useEffect(() => {
    if (alertsOpen) {
      return;
    }

    setAlertHistoryOpen(false);
  }, [alertsOpen]);

  const handleChaosTypeChange = useCallback((nextType: ChaosType) => {
    setChaosType(nextType);
    const profile = CHAOS_OPTIONS.find((option) => option.type === nextType);
    if (!profile) return;
    setChaosMagnitude(String(profile.defaultMagnitude));
    setChaosDurationMs(String(profile.defaultDurationMs));
  }, []);

  const handleWebVitalsToggle = useCallback(() => {
    startTransition(() => {
      setWebVitalsOpen((previous) => !previous);
    });
  }, []);

  const handleDeleteOldAlertHistory = useCallback(async (olderThanDays: number) => {
    if (!canDeleteAlertHistory || deleteAlertHistoryInFlightRef.current) {
      return;
    }

    if (!Number.isFinite(olderThanDays) || olderThanDays < 1) {
      toast({
        variant: "destructive",
        title: "Invalid retention window",
        description: "Choose a valid age in days before deleting old alert history.",
      });
      return;
    }

    deleteAlertHistoryRequestRef.current?.abort();
    const controller = new AbortController();
    deleteAlertHistoryRequestRef.current = controller;
    deleteAlertHistoryInFlightRef.current = true;
    setDeleteAlertHistoryBusy(true);

    try {
      const result = await deleteOldAlertHistory(olderThanDays, { signal: controller.signal });

      if (controller.signal.aborted || !mountedRef.current) {
        return;
      }

      if (result.state === "ok" && result.data?.ok) {
        setAlertsPage(1);
        setAlertHistoryPage(1);
        toast({
          title: "Old alert history deleted",
          description: `Removed ${result.data.deletedCount} resolved incidents older than ${result.data.olderThanDays} days.`,
        });
        await refreshNow();
        return;
      }

      if (result.state === "forbidden" || result.state === "unauthorized") {
        toast({
          variant: "destructive",
          title: "Permission denied",
          description: "Only superuser can delete old monitor alert history.",
        });
        return;
      }

      toast({
        variant: "destructive",
        title: "Cleanup failed",
        description: result.message || "Failed to delete old alert history.",
      });
    } finally {
      if (deleteAlertHistoryRequestRef.current === controller) {
        deleteAlertHistoryRequestRef.current = null;
      }
      deleteAlertHistoryInFlightRef.current = false;
      if (mountedRef.current) {
        setDeleteAlertHistoryBusy(false);
      }
    }
  }, [canDeleteAlertHistory, refreshNow, toast]);

  const submitChaos = useCallback(async () => {
    if (!canInjectChaos || chaosInFlightRef.current) return;

    const magnitude = chaosMagnitude.trim() === "" ? undefined : Number(chaosMagnitude);
    const durationMs = chaosDurationMs.trim() === "" ? undefined : Number(chaosDurationMs);

    if (magnitude !== undefined && !Number.isFinite(magnitude)) {
      toast({
        variant: "destructive",
        title: "Invalid magnitude",
        description: "Magnitude must be a valid number.",
      });
      return;
    }

    if (durationMs !== undefined && (!Number.isFinite(durationMs) || durationMs <= 0)) {
      toast({
        variant: "destructive",
        title: "Invalid duration",
        description: "Duration must be a positive number in milliseconds.",
      });
      return;
    }

    chaosRequestRef.current?.abort();
    const controller = new AbortController();
    chaosRequestRef.current = controller;
    chaosInFlightRef.current = true;
    setChaosLoading(true);
    try {
      const result = await injectChaos({
        type: chaosType,
        magnitude,
        durationMs,
      }, { signal: controller.signal });

      if (controller.signal.aborted || !mountedRef.current) {
        return;
      }

      if (result.state === "ok" && result.data?.success) {
        const message = `Injected ${chaosType}. Active chaos events: ${result.data.active.length}.`;
        setLastChaosMessage(message);
        toast({
          title: "Chaos injected",
          description: message,
        });
        return;
      }

      if (result.state === "forbidden" || result.state === "unauthorized") {
        toast({
          variant: "destructive",
          title: "Permission denied",
          description: "Only admin and superuser can inject chaos scenarios.",
        });
        return;
      }

      toast({
        variant: "destructive",
        title: "Chaos injection failed",
        description: result.message || "Request failed.",
      });
    } finally {
      if (chaosRequestRef.current === controller) {
        chaosRequestRef.current = null;
      }
      chaosInFlightRef.current = false;
      if (mountedRef.current) {
        setChaosLoading(false);
      }
    }
  }, [canInjectChaos, chaosDurationMs, chaosMagnitude, chaosType, toast]);

  const runRollupAction = useCallback(async (
    action: "drain" | "retry-failures" | "auto-heal" | "rebuild",
  ) => {
    if (!canManageRollups || queueActionInFlightRef.current) return;

    queueActionRequestRef.current?.abort();
    const controller = new AbortController();
    queueActionRequestRef.current = controller;
    queueActionInFlightRef.current = true;
    setQueueActionBusy(action);

    try {
      const result = action === "drain"
        ? await drainRollupQueue({ signal: controller.signal })
        : action === "retry-failures"
          ? await retryRollupFailures({ signal: controller.signal })
          : action === "auto-heal"
            ? await autoHealRollupQueue({ signal: controller.signal })
            : await rebuildCollectionRollups({ signal: controller.signal });

      if (controller.signal.aborted || !mountedRef.current) {
        return;
      }

      if (result.state === "ok" && result.data?.ok) {
        const message = result.data.message || "Rollup queue action completed.";
        setLastQueueActionMessage(message);
        toast({
          title: "Rollup queue updated",
          description: message,
        });
        await refreshNow();
        return;
      }

      if (result.state === "forbidden" || result.state === "unauthorized") {
        toast({
          variant: "destructive",
          title: "Permission denied",
          description: "Only superuser can control collection rollup recovery actions.",
        });
        return;
      }

      toast({
        variant: "destructive",
        title: "Rollup action failed",
        description: result.message || "Request failed.",
      });
    } finally {
      if (queueActionRequestRef.current === controller) {
        queueActionRequestRef.current = null;
      }
      queueActionInFlightRef.current = false;
      if (mountedRef.current) {
        setQueueActionBusy(null);
      }
    }
  }, [canManageRollups, refreshNow, toast]);

  if (accessDenied) {
    return <MonitorAccessDenied />;
  }

  return (
    <div className="app-shell-min-height bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 p-3 sm:p-6 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="mx-auto max-w-7xl space-y-4 sm:space-y-6">
        <MonitorStatusBanners
          mode={snapshot.mode}
          hasNetworkFailure={hasNetworkFailure}
          rollupFreshnessStatus={rollupFreshnessStatus}
          rollupFreshnessSummary={rollupFreshnessSummary}
        />
        <MonitorOverviewSection
          snapshot={snapshot}
          scoreStatus={scoreStatus}
          modeBadgeClass={modeBadgeClass}
          rollupFreshnessStatus={rollupFreshnessStatus}
          rollupFreshnessBadgeClass={rollupFreshnessBadgeClass}
          rollupFreshnessSummary={rollupFreshnessSummary}
          rollupFreshnessAgeLabel={rollupFreshnessAgeLabel}
        />
        <section className="glass-wrapper p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <div className="inline-flex items-center rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700 dark:text-sky-300">
                Real User Experience
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={`rounded-full px-3 py-1 text-xs ${getMonitorSummaryToneClass(webVitalsCompactSummary.tone)}`}
                >
                  {webVitalsCompactSummary.badge}
                </Badge>
                {webVitalsSummaryFacts.map((fact) => (
                  <Badge
                    key={fact.label}
                    variant="outline"
                    className={`rounded-full px-3 py-1 text-xs ${getMonitorSummaryToneClass(fact.tone)}`}
                  >
                    {fact.label} {fact.value}
                  </Badge>
                ))}
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                  {webVitalsCompactSummary.headline}
                </h2>
                <p className="max-w-3xl text-sm text-muted-foreground">
                  {webVitalsSummaryLabel}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full px-4"
                aria-expanded={webVitalsOpen}
                onClick={handleWebVitalsToggle}
              >
                {webVitalsOpen ? "Hide information" : "Information"}
                {webVitalsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {webVitalsOpen ? (
            <div className="mt-6">
              <Suspense fallback={<MonitorWebVitalsInlineFallback />}>
                <MonitorWebVitalsSection overview={webVitalsOverview} embedded />
              </Suspense>
            </div>
          ) : null}
        </section>
        <div className="space-y-3">
          <MonitorDeferredSectionToggle
            title="Key Metrics"
            statusBadgeLabel={metricsCompactSummary.badge}
            statusTone={metricsCompactSummary.tone}
            headline={metricsCompactSummary.headline}
            description={metricsCompactSummary.description}
            summaryBadges={metricsSummaryFacts.map((fact) => (
              <Badge
                key={fact.label}
                variant="outline"
                className={`rounded-full px-2.5 py-0.5 text-[10px] ${getMonitorSummaryToneClass(fact.tone)}`}
              >
                {fact.label} {fact.value}
              </Badge>
            ))}
            open={metricsOpen}
            onToggle={() => setMetricsOpen((previous) => !previous)}
          />
          {metricsOpen ? (
            <Suspense fallback={<MonitorMetricsFallback />}>
              <MonitorMetricsSection metricGroups={metricGroups} embedded />
            </Suspense>
          ) : null}
        </div>
        {canManageRollups ? (
          <div ref={rollupControlsTriggerRef}>
            {shouldRenderRollupControls ? (
              <Suspense fallback={<MonitorSectionCardFallback title="Loading rollup controls" />}>
                <MonitorRollupQueueControlsSection
                  canManageRollups={canManageRollups}
                  snapshot={snapshot}
                  busyAction={queueActionBusy}
                  lastMessage={lastQueueActionMessage}
                  onDrain={() => void runRollupAction("drain")}
                  onRetryFailures={() => void runRollupAction("retry-failures")}
                  onAutoHeal={() => void runRollupAction("auto-heal")}
                  onRebuild={() => void runRollupAction("rebuild")}
                />
              </Suspense>
            ) : (
              <MonitorSectionCardFallback title="Loading rollup controls" />
            )}
          </div>
        ) : null}
        <div ref={alertsTriggerRef}>
          {shouldRenderAlerts ? (
            <Suspense fallback={<MonitorSectionCardFallback title="Loading alerts" blocks={3} />}>
              <MonitorAlertsSection
                alertsOpen={alertsOpen}
                onAlertsOpenChange={setAlertsOpen}
                alertHistoryOpen={alertHistoryOpen}
                onAlertHistoryOpenChange={setAlertHistoryOpen}
                alerts={alerts}
                alertsPage={alertsPage}
                alertsPagination={alertsPagination}
                onAlertsPageChange={setAlertsPage}
                alertHistory={alertHistory}
                alertHistoryPage={alertHistoryPage}
                alertHistoryPagination={alertHistoryPagination}
                onAlertHistoryPageChange={setAlertHistoryPage}
                canDeleteHistory={canDeleteAlertHistory}
                deleteHistoryBusy={deleteAlertHistoryBusy}
                onDeleteOldHistory={handleDeleteOldAlertHistory}
              />
            </Suspense>
          ) : (
            <MonitorSectionCardFallback title="Loading alerts" blocks={3} />
          )}
        </div>
        <div className="space-y-3">
          <MonitorDeferredSectionToggle
            title="Intelligence Insights"
            statusBadgeLabel={insightsCompactSummary.badge}
            statusTone={insightsCompactSummary.tone}
            headline={insightsCompactSummary.headline}
            description={insightsCompactSummary.description}
            summaryBadges={insightsSummaryFacts.map((fact) => (
              <Badge
                key={fact.label}
                variant="outline"
                className={`rounded-full px-2.5 py-0.5 text-[10px] ${getMonitorSummaryToneClass(fact.tone)}`}
              >
                {fact.label} {fact.value}
              </Badge>
            ))}
            open={insightsOpen}
            onToggle={() => setInsightsOpen((previous) => !previous)}
          />
          {insightsOpen ? (
            <Suspense fallback={<MonitorInsightsFallback />}>
              <MonitorInsightsSection intelligence={intelligence} lastUpdated={lastUpdated} embedded />
            </Suspense>
          ) : null}
        </div>
        <div className="space-y-3">
          <MonitorDeferredSectionToggle
            title="Chaos Lab"
            statusBadgeLabel={chaosCompactSummary.badge}
            statusTone={chaosCompactSummary.tone}
            headline={chaosCompactSummary.headline}
            description={chaosCompactSummary.description}
            summaryBadges={chaosSummaryFacts.map((fact) => (
              <Badge
                key={fact.label}
                variant="outline"
                className={`rounded-full px-2.5 py-0.5 text-[10px] ${getMonitorSummaryToneClass(fact.tone)}`}
              >
                {fact.label} {fact.value}
              </Badge>
            ))}
            open={chaosSectionOpen}
            onToggle={() => setChaosSectionOpen((previous) => !previous)}
          />
          {chaosSectionOpen ? (
            <Suspense fallback={<MonitorSectionCardFallback title="Loading chaos lab" blocks={2} />}>
              <MonitorChaosSection
                canInjectChaos={canInjectChaos}
                chaosType={chaosType}
                selectedChaosProfile={selectedChaosProfile}
                chaosMagnitude={chaosMagnitude}
                chaosDurationMs={chaosDurationMs}
                chaosLoading={chaosLoading}
                lastChaosMessage={lastChaosMessage}
                onChaosTypeChange={handleChaosTypeChange}
                onChaosMagnitudeChange={setChaosMagnitude}
                onChaosDurationChange={setChaosDurationMs}
                onSubmit={submitChaos}
                embedded
              />
            </Suspense>
          ) : null}
        </div>
        <div className="space-y-3">
          <MonitorDeferredSectionToggle
            title="Technical DevOps View"
            statusBadgeLabel={technicalCompactSummary.badge}
            statusTone={technicalCompactSummary.tone}
            headline={technicalCompactSummary.headline}
            description={technicalCompactSummary.description}
            summaryBadges={technicalSummaryFacts.map((fact) => (
              <Badge
                key={fact.label}
                variant="outline"
                className={`rounded-full px-2.5 py-0.5 text-[10px] ${getMonitorSummaryToneClass(fact.tone)}`}
              >
                {fact.label} {fact.value}
              </Badge>
            ))}
            open={technicalChartsOpen}
            onToggle={() => setTechnicalChartsOpen((previous) => !previous)}
          />
          {technicalChartsOpen ? (
            <Suspense fallback={<MonitorChartsFallback />}>
              <MonitorTechnicalChartsSection history={history} embedded />
            </Suspense>
          ) : null}
        </div>

        <p className={isMobile ? "text-left text-xs text-muted-foreground" : "text-right text-xs text-muted-foreground"}>
          {isLoading ? "Loading..." : `Last updated: ${lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : "-"}`}
        </p>
      </div>
    </div>
  );
}

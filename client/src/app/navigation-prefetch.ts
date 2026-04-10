import {
  AIPage,
  CollectionReportPage,
  GeneralSearchPage,
  HomePage,
  ImportPage,
  SavedPage,
  SettingsRoutePage,
  SystemMonitorLayoutPage,
  ViewerPage,
} from "@/app/lazy-pages";
import {
  normalizeNavigationPrefetchTarget,
  resolvePredictivePrefetchTargets,
  type NavigationPrefetchTarget,
} from "@/app/navigation-prefetch-utils";
import {
  getAnalyticsSummary,
  getBackups,
  getLoginTrends,
  getPeakHours,
  getRoleDistribution,
  getTopActiveUsers,
} from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { buildBackupQueryParams } from "@/pages/backup-restore/backup-state-utils";
import { preloadSystemMonitorSection } from "@/pages/SystemMonitorLayout";
const DEFAULT_DASHBOARD_TREND_DAYS = 7;
const DEFAULT_BACKUP_QUERY_PARAMS = buildBackupQueryParams({
  page: 1,
  pageSize: 20,
  deferredSearchName: "",
  createdByFilter: "",
  sortBy: "newest",
  dateRange: {
    from: null,
    to: null,
  },
});

function shouldEnablePredictiveDataPrefetch() {
  if (typeof document !== "undefined" && document.documentElement.classList.contains("low-spec")) {
    return false;
  }

  if (typeof navigator === "undefined") {
    return true;
  }

  const connection = (navigator as Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean };
  }).connection;

  if (connection?.saveData) {
    return false;
  }

  return connection?.effectiveType !== "slow-2g";
}

async function preloadNavigationBundle(target: NavigationPrefetchTarget) {
  switch (target) {
    case "home":
      await HomePage.preload();
      return;
    case "import":
      await ImportPage.preload();
      return;
    case "saved":
      await SavedPage.preload();
      return;
    case "viewer":
      await ViewerPage.preload();
      return;
    case "general-search":
      await GeneralSearchPage.preload();
      return;
    case "collection-report":
      await CollectionReportPage.preload();
      return;
    case "settings":
    case "backup":
      await SettingsRoutePage.preload();
      return;
    case "dashboard":
      await Promise.allSettled([
        SystemMonitorLayoutPage.preload(),
        preloadSystemMonitorSection("dashboard"),
      ]);
      return;
    case "activity":
      await Promise.allSettled([
        SystemMonitorLayoutPage.preload(),
        preloadSystemMonitorSection("activity"),
      ]);
      return;
    case "monitor":
      await Promise.allSettled([
        SystemMonitorLayoutPage.preload(),
        preloadSystemMonitorSection("monitor"),
      ]);
      return;
    case "analysis":
      await Promise.allSettled([
        SystemMonitorLayoutPage.preload(),
        preloadSystemMonitorSection("analysis"),
      ]);
      return;
    case "audit-logs":
      await Promise.allSettled([
        SystemMonitorLayoutPage.preload(),
        preloadSystemMonitorSection("audit"),
      ]);
      return;
    case "ai":
      await AIPage.preload();
      return;
  }
}

async function prefetchDashboardData() {
  await Promise.allSettled([
    queryClient.prefetchQuery({
      queryKey: ["/api/analytics/summary"],
      queryFn: ({ signal }) => getAnalyticsSummary({ signal }),
    }),
    queryClient.prefetchQuery({
      queryKey: ["/api/analytics/login-trends", DEFAULT_DASHBOARD_TREND_DAYS],
      queryFn: ({ signal }) => getLoginTrends(DEFAULT_DASHBOARD_TREND_DAYS, { signal }),
    }),
    queryClient.prefetchQuery({
      queryKey: ["/api/analytics/top-users"],
      queryFn: ({ signal }) => getTopActiveUsers(10, { signal }),
    }),
    queryClient.prefetchQuery({
      queryKey: ["/api/analytics/peak-hours"],
      queryFn: ({ signal }) => getPeakHours({ signal }),
    }),
    queryClient.prefetchQuery({
      queryKey: ["/api/analytics/role-distribution"],
      queryFn: ({ signal }) => getRoleDistribution({ signal }),
    }),
  ]);
}

async function prefetchBackupData() {
  await queryClient.prefetchQuery({
    queryKey: ["/api/backups", DEFAULT_BACKUP_QUERY_PARAMS],
    queryFn: () => getBackups(DEFAULT_BACKUP_QUERY_PARAMS),
  });
}

export async function prefetchNavigationTarget(target: string) {
  const normalizedTarget = normalizeNavigationPrefetchTarget(target);
  if (!normalizedTarget) {
    return;
  }

  await preloadNavigationBundle(normalizedTarget);

  if (!shouldEnablePredictiveDataPrefetch()) {
    return;
  }

  if (normalizedTarget === "dashboard") {
    await prefetchDashboardData();
    return;
  }

  if (normalizedTarget === "backup") {
    await prefetchBackupData();
  }
}

export { normalizeNavigationPrefetchTarget, resolvePredictivePrefetchTargets };

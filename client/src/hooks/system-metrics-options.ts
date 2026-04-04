import { initialMonitorPagination } from "@/hooks/system-metrics-utils";

export type UseSystemMetricsOptions = {
  includeHistory?: boolean;
  includeAlerts?: boolean;
  alertsPage?: number;
  alertsPageSize?: number;
  includeAlertHistory?: boolean;
  alertHistoryPage?: number;
  alertHistoryPageSize?: number;
  includeIntelligence?: boolean;
  includeWebVitalsOverview?: boolean;
};

export type ResolvedUseSystemMetricsOptions = {
  includeHistory: boolean;
  includeAlerts: boolean;
  alertsPage: number;
  alertsPageSize: number;
  includeAlertHistory: boolean;
  alertHistoryPage: number;
  alertHistoryPageSize: number;
  includeIntelligence: boolean;
  includeWebVitalsOverview: boolean;
};

function normalizePage(value: unknown) {
  return Number.isFinite(value) ? Math.max(1, Math.floor(Number(value))) : initialMonitorPagination.page;
}

function normalizePageSize(value: unknown) {
  return Number.isFinite(value) ? Math.max(1, Math.floor(Number(value))) : initialMonitorPagination.pageSize;
}

export function resolveUseSystemMetricsOptions(
  options: UseSystemMetricsOptions = {},
): ResolvedUseSystemMetricsOptions {
  return {
    includeHistory: options.includeHistory ?? true,
    includeAlerts: options.includeAlerts ?? true,
    alertsPage: normalizePage(options.alertsPage),
    alertsPageSize: normalizePageSize(options.alertsPageSize),
    includeAlertHistory: options.includeAlertHistory ?? true,
    alertHistoryPage: normalizePage(options.alertHistoryPage),
    alertHistoryPageSize: normalizePageSize(options.alertHistoryPageSize),
    includeIntelligence: options.includeIntelligence ?? true,
    includeWebVitalsOverview: options.includeWebVitalsOverview ?? true,
  };
}

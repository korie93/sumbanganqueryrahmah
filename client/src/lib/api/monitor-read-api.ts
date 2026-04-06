import type { WebVitalOverviewPayload } from "@shared/web-vitals";

import { buildMonitorPaginationQuery } from "./monitor-query-utils";
import { fetchMonitorEndpoint } from "./monitor-request-utils";
import type {
  AlertHistoryPayload,
  AlertHistoryRequestOptions,
  AlertsPayload,
  AlertsRequestOptions,
  IntelligenceExplainPayload,
  MonitorRequestOptions,
  SystemHealthPayload,
  SystemModePayload,
  WorkersPayload,
} from "./monitor-types";

export async function getSystemHealth(options?: MonitorRequestOptions) {
  return fetchMonitorEndpoint<SystemHealthPayload>("/internal/system-health", options);
}

export async function getSystemMode(options?: MonitorRequestOptions) {
  return fetchMonitorEndpoint<SystemModePayload>("/internal/system-mode", options);
}

export async function getWorkers(options?: MonitorRequestOptions) {
  return fetchMonitorEndpoint<WorkersPayload>("/internal/workers", options);
}

export async function getAlerts(options?: AlertsRequestOptions) {
  return fetchMonitorEndpoint<AlertsPayload>(
    `/internal/alerts${buildMonitorPaginationQuery(options)}`,
    options,
  );
}

export async function getAlertHistory(options?: AlertHistoryRequestOptions) {
  return fetchMonitorEndpoint<AlertHistoryPayload>(
    `/internal/alerts/history${buildMonitorPaginationQuery(options)}`,
    options,
  );
}

export async function getWebVitalsOverview(options?: MonitorRequestOptions) {
  return fetchMonitorEndpoint<WebVitalOverviewPayload>("/internal/web-vitals", options);
}

export async function getIntelligenceExplain(options?: MonitorRequestOptions) {
  return fetchMonitorEndpoint<IntelligenceExplainPayload>("/internal/intelligence/explain", options);
}

import { deleteMonitorEndpoint, postMonitorEndpoint } from "./monitor-request-utils";
import type {
  AlertHistoryCleanupPayload,
  ChaosInjectPayload,
  ChaosInjectResponse,
  MonitorRequestOptions,
  RollupQueueActionPayload,
} from "./monitor-types";

export async function deleteOldAlertHistory(
  olderThanDays: number,
  options?: MonitorRequestOptions,
) {
  return deleteMonitorEndpoint<AlertHistoryCleanupPayload>(
    "/internal/alerts/history",
    { olderThanDays },
    options,
  );
}

export async function injectChaos(payload: ChaosInjectPayload, options?: MonitorRequestOptions) {
  return postMonitorEndpoint<ChaosInjectResponse>("/internal/chaos/inject", payload, options);
}

export async function drainRollupQueue(options?: MonitorRequestOptions) {
  return postMonitorEndpoint<RollupQueueActionPayload>("/internal/rollup-refresh/drain", {}, options);
}

export async function retryRollupFailures(options?: MonitorRequestOptions) {
  return postMonitorEndpoint<RollupQueueActionPayload>("/internal/rollup-refresh/retry-failures", {}, options);
}

export async function autoHealRollupQueue(options?: MonitorRequestOptions) {
  return postMonitorEndpoint<RollupQueueActionPayload>("/internal/rollup-refresh/auto-heal", {}, options);
}

export async function rebuildCollectionRollups(options?: MonitorRequestOptions) {
  return postMonitorEndpoint<RollupQueueActionPayload>("/internal/rollup-refresh/rebuild", {}, options);
}

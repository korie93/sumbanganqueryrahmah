const POLL_INTERVAL_MS = 5000;
const LOW_SPEC_POLL_INTERVAL_MS = 10000;
const HIDDEN_POLL_INTERVAL_MS = 15000;
const LOW_SPEC_HIDDEN_POLL_INTERVAL_MS = 30000;
const DETAIL_POLL_EVERY = 3;

export function resolveSystemMetricsPollIntervalMs({
  hidden,
  lowSpec,
}: {
  hidden: boolean;
  lowSpec: boolean;
}) {
  if (hidden) {
    return lowSpec ? LOW_SPEC_HIDDEN_POLL_INTERVAL_MS : HIDDEN_POLL_INTERVAL_MS;
  }

  return lowSpec ? LOW_SPEC_POLL_INTERVAL_MS : POLL_INTERVAL_MS;
}

export function shouldPollSystemMetricsDetails({
  pollCount,
  forceDetailed = false,
}: {
  pollCount: number;
  forceDetailed?: boolean;
}) {
  if (forceDetailed) {
    return true;
  }

  return pollCount === 0 || pollCount % DETAIL_POLL_EVERY === 0;
}

export function shouldFetchSystemMetricsDetails({
  hidden,
  pollCount,
  forceDetailed = false,
}: {
  hidden: boolean;
  pollCount: number;
  forceDetailed?: boolean | undefined;
}) {
  if (hidden && !forceDetailed) {
    return false;
  }

  return shouldPollSystemMetricsDetails({ pollCount, forceDetailed });
}

export function combineOpenCircuitCount({
  localCount,
  clusterCount,
  previous,
}: {
  localCount: number | null | undefined;
  clusterCount: number | null | undefined;
  previous: number;
}) {
  const nextValue = Number(localCount ?? 0) + Number(clusterCount ?? 0);
  if (!Number.isFinite(nextValue)) {
    return previous;
  }

  return nextValue;
}

export type SystemMetricsPendingPoll = {
  forceDetailed: boolean;
};

export function mergeSystemMetricsPendingPoll(
  current: SystemMetricsPendingPoll | null,
  next: { forceDetailed?: boolean },
): SystemMetricsPendingPoll {
  return {
    forceDetailed: Boolean(current?.forceDetailed || next.forceDetailed),
  };
}

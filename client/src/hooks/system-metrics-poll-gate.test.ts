import assert from "node:assert/strict";
import test from "node:test";

import { mergeSystemMetricsPendingPoll } from "@/hooks/system-metrics-poll-gate";

test("mergeSystemMetricsPendingPoll preserves the strongest pending detail request", () => {
  assert.deepEqual(
    mergeSystemMetricsPendingPoll(null, { forceDetailed: false }),
    { forceDetailed: false },
  );

  assert.deepEqual(
    mergeSystemMetricsPendingPoll({ forceDetailed: false }, { forceDetailed: true }),
    { forceDetailed: true },
  );

  assert.deepEqual(
    mergeSystemMetricsPendingPoll({ forceDetailed: true }, { forceDetailed: false }),
    { forceDetailed: true },
  );
});

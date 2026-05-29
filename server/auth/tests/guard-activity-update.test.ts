import assert from "node:assert/strict";
import test from "node:test";
import { createActivityUpdateThrottler } from "../guard-activity-update";

test("activity update throttler logs skipped writes with coarse non-PII audit metadata", async (t) => {
  const activityId = "activity-sensitive-session-id";
  let now = new Date("2026-05-29T10:15:42.123Z").getTime();
  t.mock.method(Date, "now", () => now);

  let updateCalls = 0;
  const logs: Array<{ message: string; metadata: Record<string, unknown> }> = [];
  const throttler = createActivityUpdateThrottler({
    activityUpdateThrottleMs: 30_000,
    logger: {
      info: (message, metadata) => {
        logs.push({ message, metadata: metadata || {} });
      },
    },
    storage: {
      updateActivity: async () => {
        updateCalls += 1;
        return undefined;
      },
    },
  });

  try {
    assert.equal(await throttler.updateAuthenticatedActivity(activityId), "updated");
    now += 5_000;
    assert.equal(await throttler.updateAuthenticatedActivity(activityId), "skipped");
  } finally {
    throttler.stop();
  }

  assert.equal(updateCalls, 1);
  assert.equal(logs.length, 1);
  assert.equal(logs[0]?.message, "Authenticated activity update throttled");
  assert.equal(logs[0]?.metadata.event, "activity_update_throttled");
  assert.equal(logs[0]?.metadata.approximateTime, new Date("2026-05-29T10:15:00.000Z").getTime());
  assert.equal(logs[0]?.metadata.throttleMs, 30_000);
  assert.equal(typeof logs[0]?.metadata.activityIdHash, "string");
  assert.equal(String(logs[0]?.metadata.activityIdHash).length, 16);
  assert.equal(Object.values(logs[0]?.metadata).includes(activityId), false);
});

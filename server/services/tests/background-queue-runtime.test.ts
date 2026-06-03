import assert from "node:assert/strict";
import test from "node:test";
import { resolveBackgroundQueueConfig } from "../../queue/config";
import { buildBackgroundQueueHealthSnapshot } from "../../queue/health";
import {
  ORPHANED_UPLOAD_CLEANUP_JOB_NAME,
  registerCleanupRepeatableJob,
} from "../../queue/scheduler";

test("resolveBackgroundQueueConfig reuses the rate-limit Redis URL when no dedicated queue URL is set", () => {
  const config = resolveBackgroundQueueConfig({
    env: {},
    rateLimitRedisUrl: "rediss://redis.internal:6380/0",
  });

  assert.equal(config.enabled, true);
  assert.equal(config.redisSource, "rate-limit");
  assert.equal(config.redisUrl, "rediss://redis.internal:6380/0");
  assert.equal(config.cleanupRepeatMs, 6 * 60 * 60 * 1000);
});

test("resolveBackgroundQueueConfig prefers the dedicated queue Redis URL", () => {
  const config = resolveBackgroundQueueConfig({
    env: {
      SQR_QUEUE_REDIS_URL: "rediss://queue.internal:6380/0",
      REDIS_URL: "rediss://legacy.internal:6380/0",
    },
    rateLimitRedisUrl: "rediss://rate.internal:6380/0",
  });

  assert.equal(config.enabled, true);
  assert.equal(config.redisSource, "explicit");
  assert.equal(config.redisUrl, "rediss://queue.internal:6380/0");
});

test("resolveBackgroundQueueConfig disables queues when no Redis endpoint exists", () => {
  const config = resolveBackgroundQueueConfig({
    env: {},
    rateLimitRedisUrl: null,
    websocketRedisUrl: null,
  });

  assert.equal(config.enabled, false);
  assert.equal(config.redisSource, "none");
  assert.equal(config.redisUrl, null);
});

test("registerCleanupRepeatableJob schedules orphaned upload cleanup every configured interval", async () => {
  const calls: unknown[] = [];
  await registerCleanupRepeatableJob(
    {
      add: async (...args: unknown[]) => {
        calls.push(args);
        return {} as never;
      },
    },
    {
      cleanupRepeatMs: 120_000,
      removeOnComplete: 100,
      removeOnFail: 50,
    },
  );

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [
    ORPHANED_UPLOAD_CLEANUP_JOB_NAME,
    {},
    {
      jobId: ORPHANED_UPLOAD_CLEANUP_JOB_NAME,
      removeOnComplete: 100,
      removeOnFail: 50,
      repeat: {
        every: 120_000,
      },
    },
  ]);
});

test("buildBackgroundQueueHealthSnapshot reports queue depth and worker state", async () => {
  const snapshot = await buildBackgroundQueueHealthSnapshot({
    configured: true,
    redisSource: "rate-limit",
    queues: {
      cleanup: {
        getJobCounts: async () => ({
          active: 1,
          completed: 3,
          delayed: 2,
          failed: 0,
          paused: 0,
          waiting: 5,
        }),
      },
    },
    workers: {
      cleanup: {
        isRunning: () => true,
      },
    },
  });

  assert.equal(snapshot.configured, true);
  assert.equal(snapshot.redisSource, "rate-limit");
  assert.equal(snapshot.queues.cleanup.status, "ready");
  assert.equal(snapshot.queues.cleanup.waiting, 5);
  assert.equal(snapshot.queues.cleanup.active, 1);
  assert.equal(snapshot.workers.cleanup, "running");
  assert.equal(snapshot.queues.email.status, "disabled");
  assert.equal(snapshot.workers.email, "disabled");
});


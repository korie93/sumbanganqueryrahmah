import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("CI requires live Redis rate-limit Lua concurrency verification rather than a silent skip", () => {
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
  const job = workflow.split("  build-and-test:")[1]?.split("  coverage-gate:")[0] || "";
  assert.match(job, /services:\s+redis:\s+image: redis:7-alpine/);
  assert.match(job, /127\.0\.0\.1:6379:6379/);
  assert.match(job, /--health-cmd "redis-cli ping"/);
  assert.match(job, /run: node --import tsx --test server\/middleware\/tests\/rate-limit\.test\.ts server\/internal\/tests\/aiConcurrencyGate\.test\.ts server\/config\/tests\/runtime-env-schema\.test\.ts/);
  const step = job.split("- name: Verify live Redis rate-limit concurrency")[1]?.split("- name:")[0] || "";
  assert.match(step, /SQR_RATE_LIMIT_TEST_REDIS_URL: redis:\/\/127\.0\.0\.1:6379\/0/);
  assert.match(step, /SQR_RATE_LIMIT_TEST_REDIS_REQUIRED: "1"/);
  assert.match(step, /run: node --import tsx --test server\/http\/tests\/rate-limit-live-redis\.integration\.test\.ts/);
  assert.doesNotMatch(step, /continue-on-error|if:/);
  const source = readFileSync("server/http/tests/rate-limit-live-redis.integration.test.ts", "utf8");
  assert.match(source, /skip: !redisUrl && !required/);
  assert.match(source, /assert\.ok\(redisUrl,/);
  assert.match(source, /knownKeys\.size <= 1_000/);
  assert.doesNotMatch(source, /\.flushAll\(|\.flushDb\(/);
});

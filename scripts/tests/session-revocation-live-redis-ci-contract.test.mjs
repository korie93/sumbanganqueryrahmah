import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("CI requires isolated live Redis idle session-revocation recovery and ACL verification", () => {
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
  const job = workflow.split("  build-and-test:")[1]?.split("  coverage-gate:")[0] || "";
  assert.match(job, /services:\s+redis:\s+image: redis:7-alpine/);
  assert.match(job, /127\.0\.0\.1:6379:6379/);
  const step = job.split("- name: Verify live Redis session revocation recovery")[1]?.split("- name:")[0] || "";
  assert.match(step, /timeout-minutes: 2/);
  assert.match(step, /SQR_SESSION_REVOCATION_TEST_REDIS_URL: redis:\/\/127\.0\.0\.1:6379\/0/);
  assert.match(step, /SQR_SESSION_REVOCATION_TEST_REDIS_REQUIRED: "1"/);
  assert.match(step, /run: node --import tsx --test server\/auth\/tests\/redis-session-revocation-live\.integration\.test\.ts/);
  assert.doesNotMatch(step, /continue-on-error|if:/);

  const source = readFileSync("server/auth/tests/redis-session-revocation-live.integration.test.ts", "utf8");
  assert.match(source, /skip: !redisUrl && !required/);
  assert.match(source, /assert\.ok\(redisUrl,/);
  assert.match(source, /delete process\.env\.SQR_SESSION_REVOCATION_TEST_REDIS_URL/);
  assert.match(source, /knownKeys\.size <= 100/);
  assert.match(source, /control\.clientKill\(\{ filter: "ID", id: clientId \}\)/);
  assert.match(source, /control\.aclSetUser\(username, \["-get"\]\)/);
  assert.match(source, /control\.aclSetUser\(username, \["\+get"\]\)/);
  assert.match(source, /control\.aclDelUser\(username\)/);
  assert.match(source, /idle session readiness recovery/);
  assert.match(source, /idle recovery after restoring GET/);
  assert.doesNotMatch(source, /\.flushAll\(|\.flushDb\(|\.scan\(|\.shutdown\(|process\.env\.REDIS_URL|dotenv/);
});

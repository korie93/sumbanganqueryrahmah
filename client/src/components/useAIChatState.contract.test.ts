import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const stateSource = readFileSync(
  path.resolve(process.cwd(), "client", "src", "components", "useAIChatState.ts"),
  "utf8",
);
const executorSource = readFileSync(
  path.resolve(process.cwd(), "client", "src", "components", "useAIChatRequestExecutor.ts"),
  "utf8",
);

test("useAIChatState clears active request timeouts when cancelling or finalizing a request", () => {
  assert.match(stateSource, /useAIChatRequestExecutor\(\{/);
  assert.match(executorSource, /clearRequestTimeout,/);
  assert.match(executorSource, /clearSlowNoticeTimer\(\);\s*clearRequestTimeout\(\);/);
  assert.match(executorSource, /abortActiveRequest\(\);\s*clearRequestTimeout\(\);/);
  assert.match(executorSource, /requestTimeoutRef\.current = timeoutId/);
  assert.match(executorSource, /if \(requestTimeoutRef\.current === timeoutId\) \{\s*requestTimeoutRef\.current = null;/);
});

test("useAIChatState gates retry timers against unmount and stale sessions", () => {
  assert.match(executorSource, /const timerId = window\.setTimeout\(\(\) => \{/);
  assert.match(executorSource, /unregisterRetryTimer\(timerId\);/);
  assert.match(executorSource, /canRetryAIChatRequest\(sessionId, sessionRef, isMountedRef, processingRef\)/);
  assert.match(executorSource, /registerRetryTimer\(timerId\);/);
  assert.match(stateSource, /clearRetryTimers\(\);/);
});

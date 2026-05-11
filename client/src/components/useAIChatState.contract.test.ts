import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const source = readFileSync(
  path.resolve(process.cwd(), "client", "src", "components", "useAIChatState.ts"),
  "utf8",
);

test("useAIChatState clears active request timeouts when cancelling or finalizing a request", () => {
  assert.match(source, /clearRequestTimeout,/);
  assert.match(source, /clearRequestTimeout\(\);\s*clearSlowNoticeTimer\(\);/);
  assert.match(source, /abortActiveRequest\(\);\s*clearRequestTimeout\(\);/);
  assert.match(source, /requestTimeoutRef\.current = timeoutId/);
  assert.match(source, /if \(requestTimeoutRef\.current === timeoutId\) \{\s*requestTimeoutRef\.current = null;/);
});

test("useAIChatState gates retry timers against unmount and stale sessions", () => {
  assert.match(source, /const timerId = window\.setTimeout\(\(\) => \{/);
  assert.match(source, /unregisterRetryTimer\(timerId\);/);
  assert.match(source, /canRetryAIChatRequest\(sessionId, sessionRef, isMountedRef, processingRef\)/);
  assert.match(source, /registerRetryTimer\(timerId\);/);
  assert.match(source, /clearRetryTimers\(\);/);
});

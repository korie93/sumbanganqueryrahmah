import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readSource(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("AutoLogout centralizes browser timers through useTimers", () => {
  const autoLogoutSource = readSource("client/src/components/AutoLogout.tsx");
  const activityRuntimeSource = readSource("client/src/components/auto-logout-activity-runtime.ts");
  const socketRuntimeSource = readSource("client/src/components/auto-logout-socket-runtime.ts");
  const timersHookSource = readSource("client/src/hooks/useTimers.ts");

  assert.match(autoLogoutSource, /import \{ useTimers \} from "@\/hooks\/useTimers"/);
  assert.match(autoLogoutSource, /const \{[\s\S]*setManagedInterval[\s\S]*setManagedTimeout[\s\S]*\} = useTimers\(\)/);
  assert.doesNotMatch(autoLogoutSource, /window\.set(?:Timeout|Interval)|window\.clear(?:Timeout|Interval)/);

  assert.match(activityRuntimeSource, /setHeartbeatInterval: \(callback: \(\) => void, delayMs: number\) => number/);
  assert.doesNotMatch(activityRuntimeSource, /window\.setInterval/);

  assert.match(socketRuntimeSource, /setReconnectTimeout: \(callback: \(\) => void, delayMs: number\) => number/);
  assert.doesNotMatch(socketRuntimeSource, /window\.setTimeout/);

  assert.match(timersHookSource, /useEffect\(\(\) => clearAllTimers, \[clearAllTimers\]\)/);
  assert.match(timersHookSource, /timeoutIdsRef\.current\.clear\(\)/);
  assert.match(timersHookSource, /intervalIdsRef\.current\.clear\(\)/);
});

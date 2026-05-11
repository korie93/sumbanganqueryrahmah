import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const source = readFileSync(
  path.resolve(process.cwd(), "client", "src", "components", "useFloatingAILayoutState.ts"),
  "utf8",
);

test("useFloatingAILayoutState cleans up resize debounce, observers, listeners, and frames", () => {
  assert.match(source, /window\.addEventListener\("resize", scheduleResizeSync, \{ passive: true \}\)/);
  assert.match(source, /window\.removeEventListener\("resize", scheduleResizeSync\)/);
  assert.match(source, /window\.clearTimeout\(resizeDebounceHandle\)/);
  assert.match(source, /window\.cancelAnimationFrame\(frame\)/);
  assert.match(source, /resizeObserver\?\.disconnect\(\)/);
  assert.match(source, /observer\?\.disconnect\(\)/);
});

test("useFloatingAILayoutState keeps obstacle scroll tracking opt-in and removable", () => {
  assert.match(source, /if \(shouldTrackObstacleLayout\) \{\s*window\.addEventListener\("scroll", scheduleSync, \{ passive: true \}\);/);
  assert.match(source, /if \(shouldTrackObstacleLayout\) \{\s*window\.removeEventListener\("scroll", scheduleSync\);/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const source = readFileSync(
  path.resolve(process.cwd(), "client", "src", "components", "useFloatingAILayoutState.ts"),
  "utf8",
);

test("useFloatingAILayoutState cleans up resize debounce, observers, listeners, and frames", () => {
  assert.match(source, /const layoutListenerCleanupRef = useRef<\(\(\) => void\) \| null>\(null\);/);
  assert.match(source, /layoutListenerCleanupRef\.current\?\.\(\);\s*layoutListenerCleanupRef\.current = null;/);
  assert.match(source, /window\.addEventListener\("resize", scheduleResizeSync, \{ passive: true \}\)/);
  assert.match(source, /window\.removeEventListener\("resize", scheduleResizeSync\)/);
  assert.match(source, /window\.clearTimeout\(resizeDebounceHandle\)/);
  assert.match(source, /window\.cancelAnimationFrame\(frame\)/);
  assert.match(source, /resizeObserver\?\.disconnect\(\)/);
  assert.match(source, /observer\?\.disconnect\(\)/);
  assert.match(source, /mounted = false;/);
  assert.match(source, /layoutListenerCleanupRef\.current = cleanupLayoutListeners;/);
  assert.match(source, /if \(layoutListenerCleanupRef\.current === cleanupLayoutListeners\) \{/);
});

test("useFloatingAILayoutState prevents focus listener accumulation across condition changes", () => {
  assert.match(source, /const focusListenerCleanupRef = useRef<\(\(\) => void\) \| null>\(null\);/);
  assert.match(source, /focusListenerCleanupRef\.current\?\.\(\);\s*focusListenerCleanupRef\.current = null;/);
  assert.match(source, /document\.addEventListener\("focusin", updateFocusedEditable\)/);
  assert.match(source, /document\.removeEventListener\("focusin", updateFocusedEditable\)/);
  assert.match(source, /focusListenerCleanupRef\.current = cleanupFocusListeners;/);
  assert.match(source, /if \(focusListenerCleanupRef\.current === cleanupFocusListeners\) \{/);
});

test("useFloatingAILayoutState keeps obstacle scroll tracking opt-in and removable", () => {
  assert.match(source, /if \(shouldTrackObstacleLayout\) \{\s*window\.addEventListener\("scroll", scheduleSync, \{ passive: true \}\);/);
  assert.match(source, /if \(shouldTrackObstacleLayout\) \{\s*window\.removeEventListener\("scroll", scheduleSync\);/);
});

test("useFloatingAILayoutState scopes mutation observation to the floating AI root", () => {
  assert.match(source, /const observedRoot = floatingRootRef\.current;/);
  assert.match(source, /if \(!observedRoot\) return;/);
  assert.match(source, /observer\.observe\(observedRoot, \{/);
  assert.doesNotMatch(source, /observer\.observe\(document\.body/);
  assert.doesNotMatch(source, /subtree:\s*true/);
});

test("useFloatingAILayoutState coalesces observer work and guards stale refs", () => {
  assert.match(source, /const FLOATING_AI_LAYOUT_RESIZE_DEBOUNCE_MS = 80;/);
  assert.match(source, /if \(!mounted \|\| !observedRoot\.isConnected\) return;/);
  assert.match(source, /if \(scheduled\) return;/);
  assert.match(source, /frame = null;/);
});

test("useFloatingAILayoutState reads current layout inputs through a ref to avoid stale closures", () => {
  assert.match(source, /const syncInputsRef = useRef\(\{/);
  assert.match(source, /syncInputsRef\.current = \{/);
  assert.match(source, /const state = syncInputsRef\.current;/);
  assert.match(source, /const syncLayout = useCallback\(\(obstacleQuery\?: FloatingAiObstacleQueryResult \| null\) => \{/);
  assert.match(source, /\}, \[\]\);/);
});

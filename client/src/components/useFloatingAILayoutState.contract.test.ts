import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const source = readFileSync(
  path.resolve(process.cwd(), "client", "src", "components", "useFloatingAILayoutState.ts"),
  "utf8",
);
const savedPageSource = readFileSync(
  path.resolve(process.cwd(), "client", "src", "pages", "Saved.tsx"),
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

test("save form disclosure toggles resync moved obstacles without observing the entire document", () => {
  assert.match(source, /event\.target\.closest\("\.save-collection-workspace"\)/);
  assert.match(source, /if \(saveCollectionRoute\) \{\s*document\.addEventListener\("toggle", scheduleSaveCollectionToggleSync, true\);/);
  assert.match(source, /if \(saveCollectionRoute\) \{\s*document\.removeEventListener\("toggle", scheduleSaveCollectionToggleSync, true\);/);
});

test("Saved mobile portal focus resyncs the idle launcher with balanced scoped listeners", () => {
  assert.match(source, /if \(savedMobileRoute\) \{\s*\/\/[\s\S]*?document\.addEventListener\("focusin", scheduleSync\);\s*document\.addEventListener\("focusout", scheduleSync\);/);
  assert.match(source, /if \(savedMobileRoute\) \{\s*document\.removeEventListener\("focusin", scheduleSync\);\s*document\.removeEventListener\("focusout", scheduleSync\);/);
  assert.match(source, /\[hiddenForAiPage, saveCollectionRoute, savedMobileRoute, shouldTrackObstacleLayout, syncLayout\]/);
});

test("Saved lazy route announces its mounted workspace to a removable mobile-only listener", () => {
  assert.match(savedPageSource, /useEffect\(\(\) => \{\s*\/\/[^\n]*\n\s*document\.dispatchEvent\(new Event\("sqr:saved-workspace-ready"\)\);\s*\}, \[\]\);/);
  assert.match(source, /if \(savedMobileRoute\) \{[^}]*document\.addEventListener\("sqr:saved-workspace-ready", scheduleSync\);/);
  assert.match(source, /if \(savedMobileRoute\) \{[^}]*document\.removeEventListener\("sqr:saved-workspace-ready", scheduleSync\);/);
});

test("useFloatingAILayoutState scopes default mutation observation to the floating AI root", () => {
  assert.match(source, /const observedRoot = floatingRootRef\.current;/);
  assert.match(source, /if \(!observedRoot\) return;/);
  assert.match(source, /observer\.observe\(observedRoot, \{/);
  assert.doesNotMatch(source, /observer\.observe\(document\.body/);
  const defaultObservation = source.match(/observer\.observe\(observedRoot, \{([\s\S]*?)\}\);/);
  assert.ok(defaultObservation);
  assert.doesNotMatch(defaultObservation[1], /subtree:\s*true/);
});

test("Saved mobile resyncs same-height result swaps with a removable workspace-only observer", () => {
  assert.match(source, /savedMobileRoute \? document\.querySelector\("\.saved-workspace"\) : null/);
  assert.match(source, /if \(nextSavedWorkspace !== observedSavedWorkspace\)/);
  assert.match(source, /savedWorkspaceObserver = new MutationObserver\(scheduleSync\)/);
  assert.match(source, /savedWorkspaceObserver\.observe\(nextSavedWorkspace, \{\s*childList: true,\s*subtree: true,\s*attributes: true,\s*attributeFilter: \["aria-busy", "aria-expanded", "disabled"\]/);
  assert.match(source, /observer\?\.disconnect\(\);\s*savedWorkspaceObserver\?\.disconnect\(\);\s*resizeObserver\?\.disconnect\(\);/);
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

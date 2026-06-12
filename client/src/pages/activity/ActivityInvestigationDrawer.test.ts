import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("session investigation drawer cancels requests and does not render raw audit details", async () => {
  const [drawerSource, hookSource] = await Promise.all([
    readFile(new URL("./ActivityInvestigationDrawer.tsx", import.meta.url), "utf8"),
    readFile(new URL("./useActivityInvestigation.ts", import.meta.url), "utf8"),
  ]);

  assert.match(hookSource, /controllerRef\.current\?\.abort\(\)/);
  assert.match(hookSource, /return \(\) => \{\s*controller\.abort\(\)/);
  assert.match(hookSource, /controller\.signal\.aborted/);
  assert.match(drawerSource, /fingerprintHint/);
  assert.doesNotMatch(drawerSource, /auditEvent\.details|event\.details/);
  assert.match(drawerSource, /Signals describe recorded session state/);
  assert.match(drawerSource, /data-floating-ai-avoid="true"/);
  assert.match(drawerSource, /onOpenAutoFocus/);
  assert.match(drawerSource, /onCloseAutoFocus/);
  assert.match(drawerSource, /returnFocus\.focus\(\)/);
});

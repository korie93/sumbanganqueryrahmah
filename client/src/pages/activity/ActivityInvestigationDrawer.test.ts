import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("session investigation drawer cancels requests and renders safe correlation details", async () => {
  const [drawerSource, hookSource, relatedSessionsSource] = await Promise.all([
    readFile(new URL("./ActivityInvestigationDrawer.tsx", import.meta.url), "utf8"),
    readFile(new URL("./useActivityInvestigation.ts", import.meta.url), "utf8"),
    readFile(new URL("./ActivityInvestigationRelatedSessions.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(hookSource, /controllerRef\.current\?\.abort\(\)/);
  assert.match(hookSource, /return \(\) => \{\s*controller\.abort\(\)/);
  assert.match(
    hookSource,
    /const isActiveInvestigationRequest = useCallback\(\(controller: AbortController\) => \(\s*controllerRef\.current === controller && !controller\.signal\.aborted\s*\), \[\]\);/s,
  );
  assert.match(hookSource, /if \(isActiveInvestigationRequest\(controller\)\) \{\s*setData\(investigation\);/s);
  assert.match(hookSource, /if \(isActiveInvestigationRequest\(controller\) && !isAbortError\(loadError\)\) \{/);
  assert.match(hookSource, /if \(isActiveInvestigationRequest\(controller\)\) \{\s*setLoading\(false\);/s);
  assert.match(drawerSource, /fingerprintHint/);
  assert.match(drawerSource, /Device class/);
  assert.match(drawerSource, /data\.session\.device\.platform/);
  assert.doesNotMatch(drawerSource, /auditEvent\.details|event\.details/);
  assert.match(drawerSource, /Signals describe recorded session state/);
  assert.match(drawerSource, /data\.security\.signals\.map/);
  assert.match(drawerSource, /ActivityInvestigationRelatedSessions/);
  assert.match(relatedSessionsSource, /Same account/);
  assert.match(relatedSessionsSource, /Same IP/);
  assert.match(relatedSessionsSource, /Same device/);
  assert.match(relatedSessionsSource, /CollapsibleContent/);
  assert.match(relatedSessionsSource, /AppPaginationBar/);
  assert.match(relatedSessionsSource, /Delete related session log/);
  assert.match(relatedSessionsSource, /pagination\.total/);
  assert.match(drawerSource, /deleteActivityLog\(relatedDeleteTarget\.id\)/);
  assert.match(drawerSource, /button-confirm-delete-related-session/);
  assert.doesNotMatch(relatedSessionsSource, /\.fingerprint(?!Hint)/);
  assert.match(drawerSource, /data-floating-ai-avoid="true"/);
  assert.match(drawerSource, /min-h-0 flex-1 overflow-y-auto/);
  assert.match(drawerSource, /SheetFooter className="shrink-0/);
  assert.doesNotMatch(drawerSource, /SheetFooter className="sticky/);
  assert.match(drawerSource, /onOpenAutoFocus/);
  assert.match(drawerSource, /onCloseAutoFocus/);
  assert.match(drawerSource, /findInvestigationTrigger\(activity\?\.id\)/);
  assert.match(drawerSource, /element\.dataset\.testid === expectedTestId/);
  assert.match(drawerSource, /returnFocus\.focus\(\)/);
});

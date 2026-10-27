import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const readComponent = (name: string) => readFileSync(path.resolve(process.cwd(), "client/src/components", name), "utf8");
const launcher = readComponent("FloatingAIIdleLauncher.tsx");
const placement = readComponent("FloatingAIIdlePlacement.tsx");
const view = readComponent("FloatingAIIdleView.tsx");

test("ordinary idle launchers defer placement and full panel dependencies", () => {
  assert.match(launcher, /lazy\(\(\) => import\("@\/components\/FloatingAIIdlePlacement"\)\)/);
  assert.doesNotMatch(launcher, /import \{[^}]*useFloatingAILayoutState|useFloatingAIFocusManagement|FloatingAIPanel|requestIdleCallback|setTimeout/);
  assert.match(launcher, /isFloatingAiSaveCollectionRoute\(props\.activePage, location\)/);
  assert.match(launcher, /isFloatingAiSavedMobileRoute\(props\.activePage, location, isMobile\)/);
  assert.match(launcher, /<Suspense fallback=\{null\}>/);
  assert.doesNotMatch(view, /FloatingAIPanel|useFloatingAILayoutState|useFloatingAIFocusManagement/);
});

test("sensitive idle routes reuse the existing collision guard without activating chat", () => {
  assert.match(placement, /useFloatingAILayoutState\(\{/);
  assert.match(placement, /isOpen: false/);
  assert.match(placement, /isThinking: false/);
  assert.match(placement, /aiStatus: "IDLE"/);
  assert.match(placement, /messageCount: 0/);
  assert.match(placement, /setIsOpen: keepIdleClosed/);
  assert.match(placement, /rootRef=\{floatingRootRef\}/);
  assert.match(placement, /applyLayoutPlacement/);
});

test("mobile idle focus suppression removes every listener when it is no longer needed", () => {
  assert.match(launcher, /if \(!props\.isMobile\)/);
  assert.match(launcher, /isEditableElement\(document\.activeElement\)/);
  for (const name of ["focusin", "focusout"]) {
    assert.ok(launcher.includes(`document.addEventListener("${name}", syncFocusedEditable)`));
    assert.ok(launcher.includes(`document.removeEventListener("${name}", syncFocusedEditable)`));
  }
  assert.match(view, /layoutState\.rootHidden \|\| hideForFocusedEditable/);
  assert.match(view, /hideForFocusedEditable=\{hideForFocusedEditable\}/);
});

test("idle loading and retry feedback stays accessible and does not expose raw failures", () => {
  assert.match(view, /<FloatingAITrigger/);
  assert.match(view, /isLoading=\{isLoading\}/);
  assert.match(view, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(view, /Memuatkan bantuan AI\./);
  assert.match(view, /Bantuan AI tidak dapat dimuatkan\. Tekan butang AI untuk cuba semula\./);
  assert.match(readComponent("FloatingAITrigger.tsx"), /aria-busy=\{isLoading \|\| undefined\}/);
  assert.match(readComponent("FloatingAITrigger.tsx"), /motion-safe:animate-spin/);
});

test("a first runtime mount opens only on the route that requested activation", () => {
  const runtimeLauncher = readComponent("FloatingAILauncher.tsx");
  assert.match(runtimeLauncher, /setRuntime\(\{ Component: module\.default, activatedOnRoute: owner \}\)/);
  assert.match(runtimeLauncher, /initiallyOpen=\{runtime\.activatedOnRoute === routeKey\}/);
});

test("a placement import failure stays local and retries with a fresh lazy component", () => {
  assert.match(launcher, /class IdlePlacementBoundary extends Component/);
  assert.match(launcher, /static getDerivedStateFromError\(\)/);
  assert.match(launcher, /<div className="mx-4 mb-4 rounded-lg border p-3 text-sm" role="alert">/);
  assert.match(launcher, /<button type="button"[\s\S]*onClick=\{this\.props\.onRetry\}/);
  assert.match(launcher, /Cuba semula bantuan AI/);
  assert.match(launcher, /attempt: previous\.attempt \+ 1, Component: createIdlePlacement\(true\)/);
  assert.match(launcher, /lazy\(importRetryPlacement\)/);
  assert.match(launcher, /key=\{placement\.attempt\}/);
  assert.match(launcher, /key=\{`\$\{props\.activePage\}:\$\{location\}:\$\{Number\(isMobile\)\}`\}/);
  assert.doesNotMatch(launcher, /error\.message|componentStack|FloatingAIChatErrorBoundary|reportClientError/);
});

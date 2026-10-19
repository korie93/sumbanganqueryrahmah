import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const appSource = source("../App.tsx");
const entrySource = source("./AuthenticatedAppEntry.tsx");
const publicSource = source("./usePublicAppState.ts");
const authenticatedSource = source("./useAuthenticatedAppState.ts");
const validationSource = source("./useAppShellSessionValidation.ts");
const gateSource = source("../components/auth/SingleActiveTabGate.tsx");
const appAst = ts.createSourceFile("App.tsx", appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

type JsxSurface = ts.JsxElement | ts.JsxSelfClosingElement;

function findElements(node: ts.Node, tag: string): JsxSurface[] {
  const matches: JsxSurface[] = [];
  const visit = (child: ts.Node) => {
    if ((ts.isJsxElement(child) && child.openingElement.tagName.getText() === tag)
      || (ts.isJsxSelfClosingElement(child) && child.tagName.getText() === tag)) matches.push(child);
    ts.forEachChild(child, visit);
  };
  visit(node);
  return matches;
}

function attributes(node: JsxSurface) {
  return (ts.isJsxElement(node) ? node.openingElement : node).attributes.properties;
}

function attribute(node: JsxSurface, name: string) {
  const prop = attributes(node).find((candidate) => ts.isJsxAttribute(candidate) && candidate.name.getText() === name);
  return prop && ts.isJsxAttribute(prop) ? prop.initializer?.getText() : undefined;
}

test("the sole protected lazy entry is structurally inside the authenticated ownership boundary", () => {
  const gates = findElements(appAst, "SingleActiveTabGate");
  const protectedEntries = findElements(appAst, "AuthenticatedAppEntry");
  assert.equal(gates.length, 1);
  assert.equal(protectedEntries.length, 1);
  assert.equal(findElements(gates[0], "AuthenticatedAppEntry")[0], protectedEntries[0]);
  assert.match(appSource, /const SingleActiveTabGate = lazy\(\(\) => import\("@\/components\/auth\/SingleActiveTabGate"\)\)/);
  assert.match(source("./authenticated-entry-lazy.ts"), /lazyWithPreload\(\(\) => import\("@\/app\/AuthenticatedAppEntry"\)\)/);
  assert.doesNotMatch(appSource + publicSource, /AuthenticatedAppEntry\.preload\s*\(|import\("@\/app\/AuthenticatedAppEntry"\)/);
  assert.ok(appSource.indexOf("if (!isInitialized)") < gates[0].getStart());
  assert.ok(appSource.indexOf("if (!user)") < gates[0].getStart());
});

test("the boundary keys ownership by backend account ID and remains stable through SPA navigation", () => {
  const gate = findElements(appAst, "SingleActiveTabGate")[0];
  assert.equal(attribute(gate, "accountId"), '{user.id ?? ""}');
  assert.equal(attribute(gate, "logoSrc"), "{SQR_BRAND_ASSETS.transparentIcon}");
  assert.equal(attribute(gate, "onBeforeActivate"), "{validateBeforeActivation}");
  assert.equal(attribute(gate, "key"), undefined, "route changes must not unmount the ownership boundary");
  assert.match(gateSource, /<AccountTabGate key=\{String\(props\.accountId\)\}/);
  assert.doesNotMatch(gateSource, /\[accountId,\s*(?:currentPage|location|pathname)/);
  assert.doesNotMatch(appSource + entrySource + authenticatedSource, /useSingleTabSession\s*\(|from ["'][^"']*useSingleTabSession/);
});

test("sensitive hooks, providers and modules only start in the gated protected entry", () => {
  assert.doesNotMatch(appSource + publicSource, /useAuthenticatedAppState\s*\(|<AppProviders\b|useActivityTracker\s*\(|useIdleTimeout\s*\(/);
  assert.match(entrySource, /useAuthenticatedAppState\(\{/);
  assert.match(entrySource, /<AppProviders>/);
  assert.match(authenticatedSource, /useAppShellRuntimeState\(\{ user \}\)/);
  assert.match(authenticatedSource, /useAppShellTabVisibility\(\{ user \}\)/);
  assert.match(authenticatedSource, /useAppShellSavedCount\(\{/);
});

test("activation requires an abort-aware fresh backend identity and rebinds before mounting a changed account", () => {
  assert.match(appSource, /const validateBeforeActivation = useCallback\(async \(signal: AbortSignal\)/);
  assert.match(appSource, /if \(signal\.aborted\) return false;\s*const result = await validateTabSession\(signal\);\s*if \(signal\.aborted\) return false;/);
  assert.match(appSource, /result\.status !== "verified"\) return false/);
  assert.match(appSource, /if \(!user\?\.id \|\| result\.user\.id !== user\.id\) \{\s*handleVerifiedAccountChanged\(result\.user\);\s*return false;/);
  assert.match(appSource, /handleVerifiedSession\(result\.user\);\s*return true;/);
  assert.match(publicSource, /const handleVerifiedAccountChanged = useCallback\(\(verifiedUser: User\) => \{[\s\S]*?setUser\(verifiedUser\)/);
  assert.match(gateSource, /await validation\.current\(validationController\.signal\)/);
  assert.match(gateSource, /validationAbort\.current\?\.abort\(\)/);
});

test("a runtime account change returns through the outer boundary instead of adopting a different account's hooks", () => {
  assert.equal(attribute(findElements(appAst, "AuthenticatedAppEntry")[0], "onAccountChanged"), "{handleVerifiedAccountChanged}");
  assert.match(entrySource, /useAuthenticatedAppState\(\{[\s\S]*?onAccountChanged,/);
  assert.match(authenticatedSource, /useAppShellSessionValidation\(\{[\s\S]*?onAccountChanged,/);
  assert.match(validationSource, /resolveSessionValidationAccount\(actor, nextUser\)/);
  const changedAccountCheck = validationSource.indexOf('accountResolution !== "same-account"');
  const persistUser = validationSource.indexOf("persistAuthenticatedUser(nextUser)");
  assert.ok(changedAccountCheck >= 0 && changedAccountCheck < persistUser);
  assert.match(validationSource, /onAccountChanged\(nextUser\);[\s\S]*?return;[\s\S]*?persistAuthenticatedUser\(nextUser\)/);
});

test("StrictMode replay cancels its disposed setup before the initial atomic lock request", () => {
  assert.match(gateSource, /attempt\.current = acquire;[\s\S]*?void Promise\.resolve\(\)\.then\(\(\) => \{\s*if \(!disposed\) void acquire\(true\);\s*\}\);/);
  assert.match(gateSource, /return \(\) => \{\s*disposed = true;\s*attempt\.current = null;\s*release\(\);/);
  assert.match(gateSource, /serial === attemptSerial\.current && controller\.current === lock/);
  assert.match(gateSource, /const onPageHide = \(\) => \{[\s\S]*?flushSync\([\s\S]*?release\(\);/);
  assert.match(gateSource, /event\.persisted && !disposed\) void acquire\(true\)/);
});

test("blocked-tab revocation signals only clear local React state and never rebroadcast or revoke a shared session", () => {
  const localLogout = publicSource.match(/const handleAuthenticatedLogout = useCallback\(\(\) => \{([\s\S]*?)\}, \[\]\);/)?.[1] ?? "";
  assert.match(localLogout, /setUser\(null\)/);
  assert.doesNotMatch(localLogout, /broadcast|fetch\(|clearAuthenticatedUserStorage|activityLogout|logout\(/);
  assert.match(publicSource, /return subscribeForcedLogout\(handleAuthenticatedLogout\)/);
  assert.doesNotMatch(source("./single-tab-session-validation.ts"), /import.*apiRequest|broadcastForcedLogout\s*\(|clearAuthenticatedUserStorage\s*\(/);
});

test("pre-gate bootstrap aborts stale identity reads without shared cookie clears or forced logout broadcasts", () => {
  const restore = publicSource.slice(publicSource.indexOf("const restoreController = new AbortController()"),
    publicSource.indexOf("}, [bootstrap.resolvedRoute"));
  assert.match(restore, /validateTabSession\(restoreController.signal\)/);
  assert.match(restore, /restoreController.abort\(\)/);
  assert.match(restore, /cancelled \|\| restoreController.signal.aborted/);
  assert.doesNotMatch(restore, /getMe\(|clearAuthenticatedUserStorage\(|broadcastForcedLogout\(/);
  assert.match(restore, /forcePasswordChange \|\| Boolean\(me.mustChangePassword\)/);
});

test("a previously active document discards old account/role query data before mounting a newly verified owner", () => {
  const idCheck = appSource.indexOf("result.user.id !== user.id");
  const clear = appSource.indexOf("queryClient.clear()");
  const activate = appSource.indexOf("handleVerifiedSession(result.user)");
  assert.ok(idCheck >= 0 && idCheck < clear && clear < activate);
  assert.match(appSource, /JSON.stringify\(\[result.user.id, result.user.role\]\)/);
  assert.match(appSource, /lastActivatedAccountScope.current !== accountScope/);
  assert.match(appSource, /await import\("@\/lib\/queryClient"\);\s*if \(signal.aborted\) return false;\s*queryClient.clear\(\)/);
});

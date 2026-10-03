import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const source = readFileSync(
  path.resolve(process.cwd(), "client", "src", "pages", "ChangePassword.tsx"),
  "utf8",
);

test("ChangePassword aborts the previous submit before creating a replacement controller", () => {
  assert.match(source, /const changePasswordRequestIdRef = useRef\(0\);/);
  assert.match(
    source,
    /const requestId = \+\+changePasswordRequestIdRef\.current;\s*changePasswordAbortControllerRef\.current\?\.abort\("superseded"\);\s*changePasswordAbortControllerRef\.current = null;\s*let controller: AbortController \| null = null;[\s\S]*controller = new AbortController\(\);\s*changePasswordAbortControllerRef\.current = controller;/,
  );
});

test("ChangePassword ignores stale or aborted submit completions", () => {
  assert.match(source, /requestId !== changePasswordRequestIdRef\.current/);
  assert.match(source, /isPublicAuthAbortError\(submitError\)/);
  assert.match(source, /if \(changePasswordAbortControllerRef\.current === controller\) \{/);
  assert.match(source, /mountedRef\.current && requestId === changePasswordRequestIdRef\.current/);
});

test("ChangePassword aborts on unmount while the profile menu owns real session logout", () => {
  assert.match(source, /mountedRef\.current = false;\s*changePasswordRequestIdRef\.current \+= 1;\s*changePasswordAbortControllerRef\.current\?\.abort\("unmount"\);\s*changePasswordAbortControllerRef\.current = null;/);
  assert.match(source, /window\.clearTimeout\(redirectTimeoutRef\.current\)/);
  assert.doesNotMatch(source, /handleLogout|clearAuthenticatedUserStorage|Log Keluar|<LogOut/);

  const readApp = (name: string) => readFileSync(path.resolve(process.cwd(), "client/src/app", name), "utf8");
  const shell = readApp("AuthenticatedAppShell.tsx");
  const forcedBranch = shell.slice(shell.indexOf("if (user.mustChangePassword)"), shell.indexOf("<AIProvider>"));
  assert.match(forcedBranch, /<NavbarUserMenuDropdown[\s\S]*onLogout=\{onLogout\}/);
  assert.match(forcedBranch, /<ChangePasswordPage forced username=\{user.username\}/);
  assert.match(readApp("AuthenticatedAppEntry.tsx"), /onLogout=\{handleLogout\}/);
  assert.match(readApp("useAuthenticatedAppState.ts"), /handleLogout = useCallback\(async \(\) => \{[\s\S]*await performAppLogout/);
  assert.match(readApp("logout-flow.ts"), /await activityLogout\(activityId\)/);
  assert.match(readApp("logout-flow.ts"), /finally \{\s*performClientLogout\(/);
});

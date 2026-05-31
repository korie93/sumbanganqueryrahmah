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

test("ChangePassword aborts active submit controllers on unmount and logout", () => {
  assert.match(source, /changePasswordAbortControllerRef\.current\?\.abort\("unmount"\)/);
  assert.match(source, /changePasswordAbortControllerRef\.current\?\.abort\("logout"\)/);
});

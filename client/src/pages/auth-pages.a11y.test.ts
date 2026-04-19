import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();

function readClientFile(relativePath: string) {
  return readFileSync(path.resolve(repoRoot, "client", "src", relativePath), "utf8");
}

test("Public auth layout keeps a single main landmark and busy-state wiring", () => {
  const source = readClientFile("components/PublicAuthLayout.tsx");

  assert.match(source, /<main id="main-content"/);
  assert.match(source, /const contentBusyProps = contentBusy \? \{ "aria-busy": "true" as const \} : \{\};/);
  assert.match(source, /className="public-auth-layout__content" \{\.\.\.contentBusyProps\}/);
});

test("Login keeps explicit labels and a named icon-only password toggle", () => {
  const source = readClientFile("pages/Login.tsx");

  assert.match(source, /<label className="sr-only" htmlFor="login-username">/);
  assert.match(source, /<label className="sr-only" htmlFor="login-password">/);
  assert.match(source, /aria-label="Hide password"/);
  assert.match(source, /aria-label="Show password"/);
  assert.match(source, /<main[\s\S]*id="main-content"/);
});

test("Forgot password flow keeps explicit recovery status and alert semantics", () => {
  const source = readClientFile("pages/ForgotPassword.tsx");

  assert.match(source, /Jika akaun wujud, permintaan tetapan semula telah dihantar untuk semakan\./);
  assert.match(source, /role="status" aria-live="polite"/);
  assert.match(source, /role="alert"/);
  assert.match(source, /contentBusy=\{loading\}/);
});

test("Change password flow keeps explicit alert and success semantics", () => {
  const source = readClientFile("pages/ChangePassword.tsx");

  assert.match(source, /role="alert"/);
  assert.match(source, /role="status" aria-live="polite"/);
  assert.match(source, /showBackButton=\{false\}/);
  assert.match(source, /contentBusy=\{loading\}/);
});

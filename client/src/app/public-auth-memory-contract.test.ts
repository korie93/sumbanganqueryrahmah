import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readClientSource(relativePath: string) {
  return readFileSync(path.resolve(__dirname, relativePath), "utf8");
}

function readFirstCssRuleBlock(source: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`${escapedSelector}\\s*{([^}]*)}`));
  return match?.[1] ?? "";
}

test("public authentication routes do not warm the authenticated shell before login succeeds", () => {
  const loginSource = readClientSource("../pages/Login.tsx");
  const authenticatedEntrySource = readClientSource("AuthenticatedAppEntry.tsx");

  assert.doesNotMatch(loginSource, /authenticated-entry-lazy/);
  assert.doesNotMatch(loginSource, /AuthenticatedAppEntry\.preload\s*\(/);
  assert.doesNotMatch(authenticatedEntrySource, /AuthenticatedAppShell\.preload\s*\(/);
});

test("login shell avoids persistent compositor hints on large decorative layers", () => {
  const loginCss = readClientSource("../pages/Login.css");

  assert.doesNotMatch(readFirstCssRuleBlock(loginCss, ".login-bg-orb"), /will-change:/);
  assert.doesNotMatch(readFirstCssRuleBlock(loginCss, ".login-content"), /will-change:/);
});

test("forgot password route uses lightweight auth chrome without eager recovery preloading", () => {
  const appSource = readClientSource("../App.tsx");
  const forgotPasswordSource = readClientSource("../pages/ForgotPassword.tsx");
  const publicAuthCss = readClientSource("../components/PublicAuthLayout.css");

  assert.doesNotMatch(appSource, /ForgotPasswordPage\.preload\s*\(/);
  assert.match(forgotPasswordSource, /visualMode="minimal"/);
  assert.match(publicAuthCss, /\.public-auth-layout--minimal\s+\.public-auth-layout__glow/);
  assert.match(
    publicAuthCss,
    /\.public-auth-layout:not\(\.public-auth-layout--minimal\)\s+\.public-auth-layout__card/,
  );
});

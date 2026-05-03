import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const visualContractSource = readFileSync(
  path.join(repoRoot, "scripts", "ui-visual-contract.mjs"),
  "utf8",
);
const loginPageSource = readFileSync(
  path.join(repoRoot, "client", "src", "pages", "Login.tsx"),
  "utf8",
);

test("visual contract authenticated login follows the stable login test ids", () => {
  assert.match(visualContractSource, /getByTestId\("input-username"\)\.fill\(authUsername\)/);
  assert.match(visualContractSource, /getByTestId\("input-password"\)\.fill\(authPassword\)/);
  assert.match(visualContractSource, /getByTestId\("button-login"\)\.click\(\)/);
});

test("visual contract keeps the login page reachability helper aligned with the login form", () => {
  assert.match(visualContractSource, /const ensureLoginPageVisible = async \(page\) =>/);
  assert.match(visualContractSource, /Log Masuk SQR/);
  assert.match(visualContractSource, /Log In SQR System/);
  assert.match(visualContractSource, /getByTestId\("input-username"\)/);
  assert.match(loginPageSource, /data-testid="input-username"/);
  assert.match(loginPageSource, /data-testid="input-password"/);
  assert.match(loginPageSource, /data-testid="button-login"/);
});

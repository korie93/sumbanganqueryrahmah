import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("MyAccountSecurityCard keeps security controls in Malay user-facing copy", () => {
  const source = readFileSync(path.join(__dirname, "MyAccountSecurityCard.tsx"), "utf8");

  assert.match(source, /Keselamatan Akaun/);
  assert.match(source, /Kata laluan semasa/);
  assert.match(source, /Kata laluan baharu/);
  assert.match(source, /Sahkan kata laluan/);
  assert.match(source, /Tukar kata laluan/);
  assert.match(source, /Pengesahan dua faktor/);
  assert.match(source, /Kod pengesah/);
  assert.match(source, /autoComplete="current-password"/);
  assert.match(source, /autoComplete="new-password"/);
  assert.match(source, /autoComplete="one-time-code"/);

  assert.doesNotMatch(source, />Account Security</);
  assert.doesNotMatch(source, />Current Password</);
  assert.doesNotMatch(source, />New Password</);
  assert.doesNotMatch(source, />Confirm Password</);
  assert.doesNotMatch(source, />Change Password</);
});

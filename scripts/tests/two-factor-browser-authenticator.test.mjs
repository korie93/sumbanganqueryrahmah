import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { authenticatorCode, classifyTwoFactorBrowserError, TWO_FACTOR_LAYOUT_WIDTHS } from "../two-factor-browser.mjs";

function encodeBase32(text) {
  const bits = [...Buffer.from(text)].map((byte) => byte.toString(2).padStart(8, "0")).join("");
  return bits.match(/.{1,5}/g).map((chunk) => "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"[parseInt(chunk.padEnd(5, "0"), 2)]).join("");
}

test("independent browser authenticator matches RFC6238 SHA1/SHA256 vectors reduced to six digits", () => {
  for (const [algorithm, secret, expected] of [
    ["SHA1", "12345678901234567890", "287082"],
    ["SHA256", "12345678901234567890123456789012", "119246"],
  ]) {
    const uri = `otpauth://totp/SQR:fixture?secret=${encodeBase32(secret)}&algorithm=${algorithm}&digits=6&period=30`;
    assert.equal(authenticatorCode(uri, 59_000), expected);
  }
});

test("independent verifier refuses missing algorithm or unsupported enrollment parameters", () => {
  const base = "otpauth://totp/SQR:fixture?secret=JBSWY3DPEHPK3PXP&digits=6&period=30";
  assert.throws(() => authenticatorCode(base));
  assert.throws(() => authenticatorCode(`${base}&algorithm=SHA512`));
  assert.throws(() => authenticatorCode(`${base.replace('digits=6', 'digits=8')}&algorithm=SHA256`));
});

test("failure diagnostics expose only fixed categories, never raw credential-bearing browser messages", () => {
  const sensitive = { get message() { throw new Error("Do not inspect sensitive messages"); }, get stack() { throw new Error("Do not inspect sensitive stacks"); } };
  assert.equal(classifyTwoFactorBrowserError(Object.assign(Object.create(sensitive), { code: "ERR_ASSERTION" })), "assertion");
  assert.equal(classifyTwoFactorBrowserError(Object.assign(Object.create(sensitive), { name: "TimeoutError" })), "timeout");
  assert.equal(classifyTwoFactorBrowserError(Object.assign(Object.create(sensitive), { name: "Synthetic sensitive name" })), "browser-or-runtime");
  assert.equal(classifyTwoFactorBrowserError(undefined), "browser-or-runtime");
  const source = readFileSync(new URL("../two-factor-browser.mjs", import.meta.url), "utf8");
  assert.match(source, /FAIL \$\{phase\}; category=\$\{classifyTwoFactorBrowserError\(error\)\}/);
  assert.doesNotMatch(source, /console\.(?:error|log)\([^\n]*error\.(?:message|stack)/);
});

test("2FA layout covers every approved width through actual app themes and a disclosed public CSS contract without altering auth state", () => {
  assert.deepEqual(TWO_FACTOR_LAYOUT_WIDTHS, [320, 360, 390, 430, 768, 1024, 1280, 1440]);
  const source = readFileSync(new URL("../two-factor-browser.mjs", import.meta.url), "utf8");
  assert.match(source, /for \(const width of TWO_FACTOR_LAYOUT_WIDTHS\)/);
  assert.match(source, /target\.emulateMedia\(\{ colorScheme: theme \}\)/);
  assert.match(source, /root\.dataset\.theme === requestedTheme/);
  assert.match(source, /root\.classList\.contains\("dark"\) === \(requestedTheme === "dark"\)/);
  assert.match(source, /getComputedStyle\(root\)\.colorScheme === requestedTheme/);
  assert.match(source, /if \(state === "login-challenge"\) \{\s+await target\.evaluate\(\(requestedTheme\) => \{\s+document\.documentElement\.classList\.toggle\("dark", requestedTheme === "dark"\);/);
  assert.equal((source.match(/classList\.(?:toggle|add|remove)/g) || []).length, 1, "Only the public Login CSS-contract branch stamps a theme class");
  assert.match(source, /state === "login-challenge" \? "public light\/dark CSS contract" : "actual app light\/dark theme"/);
  assert.doesNotMatch(source, /route\.fulfill|storageState:|recordHar|tracing\.start|clock\.fastForward/);
  assert.match(source, /mask: \[target\.getByTestId\("two-factor-qr"\), panel\.locator\("input"\)\]/);
});

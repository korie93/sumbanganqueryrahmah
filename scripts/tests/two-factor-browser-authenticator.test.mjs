import assert from "node:assert/strict";
import test from "node:test";
import { authenticatorCode } from "../two-factor-browser.mjs";

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

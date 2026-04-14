import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const securityPolicy = readFileSync(path.join(repoRoot, "SECURITY.md"), "utf8");

test("security policy documents private vulnerability reporting guidance", () => {
  assert.match(securityPolicy, /^# Security Policy/m);
  assert.match(securityPolicy, /GitHub Security Advisories|private vulnerability reporting/i);
  assert.match(securityPolicy, /open a public issue/i);
  assert.match(securityPolicy, /supported versions/i);
});

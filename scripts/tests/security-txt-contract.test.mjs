import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();
const securityPolicyPath = path.resolve(repoRoot, "SECURITY.md");
const securityTxtPath = path.resolve(repoRoot, "client", "public", ".well-known", "security.txt");

test("security.txt stays present and aligned with the documented disclosure policy", () => {
  const securityPolicySource = readFileSync(securityPolicyPath, "utf8");
  const securityTxtSource = readFileSync(securityTxtPath, "utf8");

  assert.match(securityPolicySource, /GitHub private vulnerability reporting/i);
  assert.match(securityTxtSource, /^Contact: https:\/\/github\.com\/korie93\/sumbanganqueryrahmah\/security\/advisories\/new$/m);
  assert.match(securityTxtSource, /^Preferred-Languages: en, ms$/m);
  assert.match(securityTxtSource, /^Policy: https:\/\/github\.com\/korie93\/sumbanganqueryrahmah\/security\/policy$/m);
  assert.match(securityTxtSource, /^Expires: 2027-04-19T00:00:00\.000Z$/m);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readDoc(path) {
  return readFile(path, "utf8");
}

test("CSP runbook documents directives, reporting, testing, and CSRF relationship", async () => {
  const content = await readDoc("docs/CONTENT_SECURITY_POLICY.md");

  for (const marker of [
    "server/internal/local-http-security.ts",
    "/api/csp-report",
    "script-src",
    "style-src-elem",
    "Trusted Types",
    "npm run verify:csp-hashes",
    "CSP And CSRF",
  ]) {
    assert.match(content, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("secret leak playbook links rotation runbook and covers containment plus escalation", async () => {
  const content = await readDoc("docs/INCIDENT_RESPONSE_SECRET_LEAK.md");

  for (const marker of [
    "First 15 Minutes",
    "docs/SECRET_ROTATION.md",
    "SESSION_SECRET",
    "PG_PASSWORD",
    "Git History Containment",
    "Escalation Matrix",
    "Post-Incident Review",
  ]) {
    assert.match(content, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("secret rotation runbook documents TOTP SHA256 migration without breaking legacy SHA1 enrollments", async () => {
  const content = await readDoc("docs/SECRET_ROTATION.md");
  const normalizedContent = content.replace(/\s+/g, " ");

  for (const marker of [
    "TOTP Algorithm Migration",
    "TWO_FACTOR_TOTP_ALGORITHM=SHA256",
    "new enrollments only",
    "legacy encrypted 2FA payloads as `SHA1`",
    "disable and re-enable 2FA",
    "Existing `v2.sha256` enrollments remain verifiable",
  ]) {
    assert.match(normalizedContent, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("data retention policy covers operational categories and deletion procedures", async () => {
  const content = await readDoc("docs/DATA_RETENTION_POLICY.md");

  for (const marker of [
    "Data Categories",
    "Automated Deletion Mechanisms",
    "Manual Deletion Procedures",
    "Account Closure",
    "Collection PII Retirement",
    "Backup Retention",
    "Compliance Notes",
  ]) {
    assert.match(content, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

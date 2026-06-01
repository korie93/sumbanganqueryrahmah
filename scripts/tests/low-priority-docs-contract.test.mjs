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

test("HTTP middleware pipeline documentation preserves security-critical ordering", async () => {
  const content = await readDoc("docs/HTTP_MIDDLEWARE_PIPELINE.md");

  for (const marker of [
    "registerLocalHttpSecurityHeaders",
    "registerLocalHttpCompression",
    "registerLocalHttpBodyParsers",
    "createCorsMiddleware",
    "createSensitiveApiResponseSanitizerMiddleware",
    "createCsrfProtectionMiddleware",
    "adaptiveRateLimit",
    "systemProtectionMiddleware",
    "maintenanceGuard",
    "Do not move CSRF after route registration",
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

test("secret rotation runbook documents collection PII key rotation cadence and verification", async () => {
  const content = await readDoc("docs/SECRET_ROTATION.md");

  for (const marker of [
    "Rotate `COLLECTION_PII_ENCRYPTION_KEY` at least annually",
    "within 24 hours",
    "rotation owner",
    "restore test",
    "collection:pii-status",
    "re-encryption checks are green",
  ]) {
    assert.match(content, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("key rotation runbook covers operational key families without fictional scripts", async () => {
  const runbook = await readDoc("docs/KEY-ROTATION-RUNBOOK.md");
  const normalizedRunbook = runbook.replace(/\s+/g, " ");
  const envExample = await readDoc(".env.example");
  const security = await readDoc("SECURITY.md");

  for (const marker of [
    "# SQR Key Rotation Runbook",
    "SESSION_SECRET",
    "SESSION_SECRET_PREVIOUS",
    "SQR_AUDIT_HMAC_KEY",
    "TWO_FACTOR_ENCRYPTION_KEY",
    "COLLECTION_PII_ENCRYPTION_KEY",
    "BACKUP_ENCRYPTION_KEYS",
    "Emergency Rotation Checklist",
    "operations rotation register",
    "npm run collection:reencrypt-pii",
    "does not currently include a dedicated bulk 2FA re-encryption script",
  ]) {
    assert.match(normalizedRunbook, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.doesNotMatch(runbook, /migrate-2fa-encryption|rotate-pii-encryption|verify-pii-encryption/);
  assert.match(envExample, /docs\/KEY-ROTATION-RUNBOOK\.md/);
  assert.match(security, /docs\/KEY-ROTATION-RUNBOOK\.md/);
});

test("database SSL guide documents runtime precedence and production TLS defaults", async () => {
  const guide = await readDoc("docs/DATABASE-SSL-GUIDE.md");
  const normalizedGuide = guide.replace(/\s+/g, " ");
  const envExample = await readDoc(".env.example");

  for (const marker of [
    "# Database SSL Configuration Guide",
    "`DATABASE_URL`",
    "`PG_*` variables",
    "`PG_PASSWORD` does not patch a passwordless `DATABASE_URL`",
    "TLS is controlled separately by `DATABASE_SSL`, `DATABASE_SSL_CA`, and `DATABASE_SSL_CA_FILE`",
    "Production-like host",
    "Startup fails",
    "`rejectUnauthorized: true`",
    "DATABASE_SSL_CA_FILE",
    "scripts/post-deploy-health-check.sh",
  ]) {
    assert.match(normalizedGuide, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(envExample, /docs\/DATABASE-SSL-GUIDE\.md/);
});

test("dependency documentation describes the runtime import cycle guard", async () => {
  const content = await readDoc("docs/DEPENDENCY_SUPPLY_CHAIN.md");

  for (const marker of [
    "Runtime Import Cycle Guard",
    "server/",
    "client/src/",
    "shared/",
    "node --test scripts/tests/import-cycle-contract.test.mjs",
    "ignores type-only imports",
    "`@/` and `@shared/` aliases",
  ]) {
    assert.match(content, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
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

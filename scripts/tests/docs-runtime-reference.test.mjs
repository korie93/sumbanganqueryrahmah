import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();

function readRepoFile(relativePath) {
  return readFileSync(path.resolve(repoRoot, relativePath), "utf8");
}

test("README links the reviewed rate-limit and ER diagram docs", () => {
  const readme = readRepoFile("README.md");

  assert.match(readme, /\[docs\/RATE_LIMITS\.md\]\(\.\/docs\/RATE_LIMITS\.md\)/);
  assert.match(readme, /\[docs\/ER_DIAGRAM\.md\]\(\.\/docs\/ER_DIAGRAM\.md\)/);
  assert.match(readme, /\[docs\/API_CONTRACTS\.md\]\(\.\/docs\/API_CONTRACTS\.md\)/);
  assert.match(readme, /\[docs\/openapi\.public\.json\]\(\.\/docs\/openapi\.public\.json\)/);
  assert.match(readme, /\[docs\/DEPENDENCY_SUPPLY_CHAIN\.md\]\(\.\/docs\/DEPENDENCY_SUPPLY_CHAIN\.md\)/);
  assert.match(readme, /\[docs\/AUDIT_NO_CHANGE_DECISIONS\.md\]\(\.\/docs\/AUDIT_NO_CHANGE_DECISIONS\.md\)/);
});

test("rate-limit reference stays anchored to the runtime source of truth", () => {
  const rateLimitDoc = readRepoFile("docs/RATE_LIMITS.md");

  assert.match(rateLimitDoc, /\[server\/middleware\/rate-limit\.ts\]/);
  assert.match(rateLimitDoc, /createAuthRouteRateLimiters\(\)\.loginIp/);
  assert.match(rateLimitDoc, /searchRateLimiter/);
  assert.match(rateLimitDoc, /importsUploadRateLimiter/);
});

test("ER diagram doc stays explicitly scoped to the reviewed Drizzle subset", () => {
  const erDiagramDoc = readRepoFile("docs/ER_DIAGRAM.md");

  assert.match(erDiagramDoc, /\[shared\/schema-postgres\.ts\]/);
  assert.match(erDiagramDoc, /This diagram intentionally covers the reviewed Drizzle-managed relationship subset/i);
  assert.match(erDiagramDoc, /```mermaid/);
});

test("audit no-change decisions doc records reviewed deferments and revisit triggers", () => {
  const noChangeDoc = readRepoFile("docs/AUDIT_NO_CHANGE_DECISIONS.md");

  assert.match(noChangeDoc, /Audit #4 and Audit #5 findings that were reviewed on 19 April 2026/i);
  assert.match(noChangeDoc, /WebSocket event listener leak hardening/i);
  assert.match(noChangeDoc, /skipLibCheck/i);
  assert.match(noChangeDoc, /dark mode toggle/i);
  assert.match(noChangeDoc, /Bundle size analysis/i);
  assert.match(noChangeDoc, /What would justify revisiting/i);
});

test("observability doc stays aligned with the reviewed web-vitals runtime contract", () => {
  const observabilityDoc = readRepoFile("docs/OBSERVABILITY.md");

  assert.match(observabilityDoc, /POST \/telemetry\/web-vitals/);
  assert.match(observabilityDoc, /sendBeacon\(\)/);
  assert.match(observabilityDoc, /keepalive: true/);
  assert.match(observabilityDoc, /pageType: "public"/);
  assert.match(observabilityDoc, /pageType: "authenticated"/);
});

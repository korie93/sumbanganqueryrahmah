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

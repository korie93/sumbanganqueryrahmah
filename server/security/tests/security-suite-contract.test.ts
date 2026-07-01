import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(
  readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
) as {
  scripts?: Record<string, string>;
};

const securityScript = packageJson.scripts?.["test:security"] ?? "";

test("test:security script keeps explicit coverage for core security controls", () => {
  assert.match(securityScript, /drizzle-config-tls-contract\.test\.mjs/);
  assert.match(securityScript, /validate-env\.test\.ts/);
  assert.match(securityScript, /runtime-config-safety-utils\.test\.ts/);
  assert.match(securityScript, /csrf\.test\.ts/);
  assert.match(securityScript, /cors\.test\.ts/);
  assert.match(securityScript, /error-handler\.test\.ts/);
  assert.match(securityScript, /response-sanitizer\.test\.ts/);
  assert.match(securityScript, /collection-rollup-refresh-notification\.test\.ts/);
  assert.match(securityScript, /permission-matrix\.integration\.test\.ts/);
  assert.match(securityScript, /guards\.test\.ts/);
  assert.match(securityScript, /session-jwt\.test\.ts/);
});

test("test:security script keeps import upload safety controls in the security gate", () => {
  assert.match(securityScript, /import-upload-parser\.test\.ts/);
  assert.match(securityScript, /import-column-mapping\.test\.ts/);
  assert.match(securityScript, /import-background-job\.service\.test\.ts/);
  assert.match(securityScript, /imports-service-mutation-operations\.test\.ts/);
  assert.match(securityScript, /imports-upload-quota\.test\.ts/);
  assert.match(securityScript, /imports-multipart-route\.test\.ts/);
  assert.match(securityScript, /cleanup-orphaned-uploads\.test\.ts/);
});

test("test:security script does not depend on production secrets or production database access", () => {
  assert.doesNotMatch(securityScript, /DATABASE_URL=/);
  assert.doesNotMatch(securityScript, /PG_PASSWORD=/);
  assert.doesNotMatch(securityScript, /SESSION_SECRET=/);
  assert.doesNotMatch(securityScript, /--runInBand/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("server/internal/local-http-pipeline.ts", "utf8");

function sourceIndex(pattern: string): number {
  const index = source.indexOf(pattern);
  assert.notEqual(index, -1, `Expected local HTTP pipeline source to contain: ${pattern}`);
  return index;
}

test("local HTTP pipeline keeps security middleware in reviewed order", () => {
  const orderedPatterns = [
    "registerLocalHttpSecurityHeaders(app);",
    "registerLocalHttpCompression(app);",
    "registerLocalHttpBodyParsers(app,",
    "app.use(createCorsMiddleware());",
    "app.use(\"/uploads\",",
    "app.use(\"/api\", createSensitiveApiResponseSanitizerMiddleware());",
    "registerLocalHttpObservability(app,",
    "app.use(createForwardedForTrustProxyWarningMiddleware({",
    "app.use(createGlobalRequestTimeoutMiddleware({",
    "app.use(\"/api\", (_req, res, next) => {",
    "app.use(createCsrfProtectionMiddleware());",
    "app.use(adaptiveRateLimit);",
    "app.use(systemProtectionMiddleware);",
    "app.use(maintenanceGuard);",
  ];

  const indexes = orderedPatterns.map(sourceIndex);
  assert.deepEqual(
    indexes,
    [...indexes].sort((a, b) => a - b),
    "Local HTTP pipeline middleware order changed; review security assumptions before updating this contract.",
  );
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const rootDir = process.cwd();
const loadTestingDocsPath = path.join(rootDir, "docs", "LOAD_TESTING.md");
const loadTestingScriptPath = path.join(rootDir, "load-tests", "k6", "sqr-smoke.js");

test("load-testing docs stay aligned with the maintained k6 smoke scaffold", () => {
  const docs = readFileSync(loadTestingDocsPath, "utf8");
  const script = readFileSync(loadTestingScriptPath, "utf8");

  assert.match(docs, /load-tests\/k6\/sqr-smoke\.js/);
  assert.match(docs, /SQR_LOAD_BASE_URL/);
  assert.match(docs, /SQR_LOAD_USERNAME/);
  assert.match(docs, /SQR_LOAD_PASSWORD/);
  assert.match(docs, /GET \/api\/health\/ready`: p95 di bawah `500ms`/);
  assert.match(docs, /imports listing, dan backups listing: p95 di bawah `1500ms`/);

  assert.match(script, /http\.get\(`\$\{baseUrl\}\/api\/health\/ready`\)/);
  assert.match(script, /http\.post\(\s*`\$\{baseUrl\}\/api\/auth\/login`/);
  assert.match(script, /http\.get\(`\$\{baseUrl\}\/api\/imports`/);
  assert.match(script, /http\.get\(`\$\{baseUrl\}\/api\/backups`/);
  assert.match(script, /http_req_failed:\s*\["rate<0\.01"\]/);
  assert.match(script, /http_req_duration:\s*\["p\(95\)<1500"\]/);
});

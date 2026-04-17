import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("Docker baseline stays multi-stage and production-aware", () => {
  const dockerfile = readFileSync(path.join(repoRoot, "Dockerfile"), "utf8");

  assert.match(dockerfile, /^FROM node:24\.12\.0-bookworm-slim AS deps$/m);
  assert.match(dockerfile, /^FROM deps AS build$/m);
  assert.match(dockerfile, /^FROM node:24\.12\.0-bookworm-slim AS runtime$/m);
  assert.match(dockerfile, /npm ci --ignore-scripts/);
  assert.match(dockerfile, /npm ci --omit=dev --ignore-scripts/);
  assert.match(dockerfile, /^USER node$/m);
  assert.match(dockerfile, /HEALTHCHECK/);
  assert.match(dockerfile, /dist-local\/server\/cluster-local\.js/);
});

test("dockerignore excludes local secrets and generated artifacts", () => {
  const dockerignore = readFileSync(path.join(repoRoot, ".dockerignore"), "utf8");

  assert.match(dockerignore, /^node_modules$/m);
  assert.match(dockerignore, /^coverage$/m);
  assert.match(dockerignore, /^\.eslintcache$/m);
  assert.match(dockerignore, /^\.env$/m);
  assert.match(dockerignore, /^\.env\.\*$/m);
});

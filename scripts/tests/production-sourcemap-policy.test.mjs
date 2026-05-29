import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  findSourcemapFiles,
  isProductionLikeEnvironment,
  resolveProductionSourcemapPolicy,
} from "../lib/production-sourcemap-policy.mjs";

async function withTempDir(fn) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sqr-sourcemap-policy-"));
  try {
    return await fn(tempDir);
  } finally {
    await fs.rm(tempDir, { force: true, recursive: true });
  }
}

test("production sourcemap policy detects production-like environments", () => {
  assert.equal(isProductionLikeEnvironment({ NODE_ENV: "production" }), true);
  assert.equal(isProductionLikeEnvironment({ APP_ENV: "production" }), true);
  assert.equal(isProductionLikeEnvironment({ DEPLOY_ENV: "production" }), true);
  assert.equal(isProductionLikeEnvironment({ VERCEL_ENV: "production" }), true);
  assert.equal(isProductionLikeEnvironment({ NODE_ENV: "development" }), false);
});

test("production sourcemap policy finds nested .map files", async () => {
  await withTempDir(async (tempDir) => {
    const assetDir = path.join(tempDir, "public", "assets");
    await fs.mkdir(assetDir, { recursive: true });
    await fs.writeFile(path.join(assetDir, "index.js"), "console.log('ok');\n", "utf8");
    await fs.writeFile(path.join(assetDir, "index.js.map"), "{}", "utf8");

    const result = await findSourcemapFiles([tempDir]);

    assert.equal(result.existingDirs.length, 1);
    assert.deepEqual(
      result.sourcemapFiles.map((filePath) => path.basename(filePath)),
      ["index.js.map"],
    );
  });
});

test("production sourcemap policy blocks .map files in production artifacts", async () => {
  await withTempDir(async (tempDir) => {
    await fs.writeFile(path.join(tempDir, "server.js.map"), "{}", "utf8");

    const result = await resolveProductionSourcemapPolicy({
      forceProduction: true,
      scanDirs: [tempDir],
    });

    assert.equal(result.allowed, false);
    assert.match(result.reason, /sourcemap/i);
  });
});

test("production sourcemap policy allows .map files outside production", async () => {
  await withTempDir(async (tempDir) => {
    await fs.writeFile(path.join(tempDir, "local.js.map"), "{}", "utf8");

    const result = await resolveProductionSourcemapPolicy({
      forceProduction: false,
      scanDirs: [tempDir],
    });

    assert.equal(result.allowed, true);
    assert.equal(result.sourcemapFiles.length, 1);
  });
});

test("production sourcemap policy fails when build output is missing", async () => {
  await withTempDir(async (tempDir) => {
    const result = await resolveProductionSourcemapPolicy({
      forceProduction: true,
      scanDirs: [path.join(tempDir, "missing-dist")],
    });

    assert.equal(result.allowed, false);
    assert.match(result.reason, /No build output/i);
  });
});

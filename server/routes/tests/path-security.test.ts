import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createInternalMetrics } from "../../internal/metrics";
import {
  assertPathWithinBounds,
  PathAccessError,
  PathTraversalError,
} from "../../lib/path-security";

const silentLogger = {
  error() {
    // Test logger intentionally discards sanitized security events.
  },
};

async function createPathSecurityFixture() {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "sqr-path-security-"));
  const allowedDir = path.join(rootDir, "allowed");
  const outsideDir = path.join(rootDir, "outside");
  await fs.mkdir(allowedDir, { recursive: true });
  await fs.mkdir(outsideDir, { recursive: true });
  return { rootDir, allowedDir, outsideDir };
}

test("assertPathWithinBounds returns the real path for files inside allowed directories", async () => {
  const { rootDir, allowedDir } = await createPathSecurityFixture();
  try {
    const filePath = path.join(allowedDir, "receipt.pdf");
    await fs.writeFile(filePath, "safe", "utf8");

    const safePath = assertPathWithinBounds(filePath, {
      allowedDirectories: [allowedDir],
      context: "test-path-security",
      log: silentLogger,
      metrics: createInternalMetrics(),
    });

    assert.equal(await fs.readFile(safePath, "utf8"), "safe");
  } finally {
    await fs.rm(rootDir, { recursive: true, force: true });
  }
});

test("assertPathWithinBounds rejects resolved traversal outside allowed directories", async () => {
  const { rootDir, allowedDir, outsideDir } = await createPathSecurityFixture();
  const metrics = createInternalMetrics();
  let loggedCount = 0;
  const log = {
    error() {
      loggedCount += 1;
    },
  };

  try {
    const outsideFile = path.join(outsideDir, "secret.txt");
    await fs.writeFile(outsideFile, "secret", "utf8");

    assert.throws(
      () => assertPathWithinBounds(path.join(allowedDir, "..", "outside", "secret.txt"), {
        allowedDirectories: [allowedDir],
        context: "test-path-security",
        log,
        metrics,
      }),
      PathTraversalError,
    );
    assert.equal(metrics.snapshot().counters.collectionReceiptPathTraversalBlockedTotal, 1);
    assert.equal(loggedCount, 1);
  } finally {
    await fs.rm(rootDir, { recursive: true, force: true });
  }
});

test("assertPathWithinBounds rejects symlinks that resolve outside allowed directories", async (t) => {
  const { rootDir, allowedDir, outsideDir } = await createPathSecurityFixture();
  try {
    const outsideFile = path.join(outsideDir, "secret.txt");
    const symlinkPath = path.join(allowedDir, "receipt-link.pdf");
    await fs.writeFile(outsideFile, "secret", "utf8");
    try {
      await fs.symlink(outsideFile, symlinkPath);
    } catch {
      t.skip("filesystem does not permit symlink creation for this test user");
      return;
    }

    assert.throws(
      () => assertPathWithinBounds(symlinkPath, {
        allowedDirectories: [allowedDir],
        context: "test-path-security",
        log: silentLogger,
        metrics: createInternalMetrics(),
      }),
      PathTraversalError,
    );
  } finally {
    await fs.rm(rootDir, { recursive: true, force: true });
  }
});

test("assertPathWithinBounds reports missing files as access failures", async () => {
  const { rootDir, allowedDir } = await createPathSecurityFixture();
  try {
    assert.throws(
      () => assertPathWithinBounds(path.join(allowedDir, "missing.pdf"), {
        allowedDirectories: [allowedDir],
        context: "test-path-security",
        log: silentLogger,
        metrics: createInternalMetrics(),
      }),
      PathAccessError,
    );
  } finally {
    await fs.rm(rootDir, { recursive: true, force: true });
  }
});

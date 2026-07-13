import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createReleaseManifest,
  parseReleaseManifest,
  readReleaseManifest,
  writeReleaseManifest,
} from "../lib/release-manifest.mjs";

const validInput = {
  builtAt: "2026-07-13T08:30:00.000Z",
  commitSha: "a".repeat(40),
  sourceDirty: false,
  version: "1.0.0",
};

test("release manifest derives a deterministic ID from immutable fields", () => {
  const manifest = createReleaseManifest(validInput);

  assert.deepEqual(manifest, {
    schemaVersion: 1,
    releaseId: "sqr-1.0.0-aaaaaaaaaaaa-20260713T083000Z",
    version: "1.0.0",
    commitSha: "a".repeat(40),
    builtAt: "2026-07-13T08:30:00.000Z",
    sourceDirty: false,
  });
  assert.equal(Object.isFrozen(manifest), true);
});

test("release manifest rejects traversal tokens, invalid SHAs, and mismatched IDs", () => {
  assert.throws(
    () => createReleaseManifest({ ...validInput, version: "../../release" }),
    /release-safe token/,
  );
  assert.throws(
    () => createReleaseManifest({ ...validInput, commitSha: "abc123" }),
    /40 or 64 lowercase hexadecimal/,
  );

  const manifest = createReleaseManifest(validInput);
  assert.throws(
    () => parseReleaseManifest({ ...manifest, releaseId: "sqr-tampered" }),
    /does not match/,
  );
});

test("release manifest round-trips through a bounded JSON file", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "sqr-release-manifest-"));
  const filePath = path.join(directory, "release-manifest.json");

  try {
    const manifest = createReleaseManifest(validInput);
    writeReleaseManifest(filePath, manifest);
    assert.deepEqual(readReleaseManifest(filePath), manifest);

    writeFileSync(filePath, "x".repeat(17 * 1024));
    assert.throws(() => readReleaseManifest(filePath), /no larger than 16384 bytes/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

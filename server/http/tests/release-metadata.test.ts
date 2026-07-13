import assert from "node:assert/strict";
import test from "node:test";
import { resolvePublicReleaseMetadata } from "../../release-metadata";

test("release metadata accepts validated immutable build fields", () => {
  const metadata = resolvePublicReleaseMetadata({
    builtAt: "2026-07-13T08:30:00.000Z",
    commitSha: "a".repeat(40),
    releaseId: "sqr-1.0.0-aaaaaaaaaaaa-20260713T083000Z",
    version: "1.0.0",
  });

  assert.deepEqual(metadata, {
    builtAt: "2026-07-13T08:30:00.000Z",
    commitSha: "a".repeat(40),
    releaseId: "sqr-1.0.0-aaaaaaaaaaaa-20260713T083000Z",
    version: "1.0.0",
  });
  assert.equal(Object.isFrozen(metadata), true);
});

test("release metadata fails closed to public-safe development sentinels", () => {
  const metadata = resolvePublicReleaseMetadata({
    builtAt: "not-a-date",
    commitSha: "../../secret",
    releaseId: "invalid release id",
    version: "<script>",
  });

  assert.deepEqual(metadata, {
    builtAt: null,
    commitSha: "development",
    releaseId: "development-development",
    version: "development",
  });
});

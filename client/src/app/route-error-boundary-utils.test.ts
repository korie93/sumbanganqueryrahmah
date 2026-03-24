import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveRouteErrorDescription,
  resolveRouteErrorTitle,
} from "@/app/route-error-boundary-utils";

test("resolveRouteErrorTitle maps internal route ids to user-friendly labels", () => {
  assert.equal(resolveRouteErrorTitle("backup"), "Backup & Restore Ran Into a Problem");
  assert.equal(resolveRouteErrorTitle("collection-report"), "Collection Ran Into a Problem");
  assert.equal(resolveRouteErrorTitle("settings"), "Settings Ran Into a Problem");
});

test("resolveRouteErrorDescription gives chunk-load guidance for lazy pages", () => {
  const description = resolveRouteErrorDescription(
    new Error("ChunkLoadError: Loading chunk 17 failed."),
  );

  assert.match(description, /bundle failed to load/i);
  assert.match(description, /reload the app/i);
});

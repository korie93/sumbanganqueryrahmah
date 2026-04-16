import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveRouteErrorDescription,
  resolveRouteRetrySupportNotice,
  resolveRouteErrorTitle,
  shouldShowRouteRetrySupportNotice,
} from "@/app/route-error-boundary-utils";
import { APP_ROUTE_CHUNK_RETRY_MAX_ATTEMPTS } from "@/app/route-error-boundary-retry-utils";

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

test("route retry support notice appears only after chunk-load retries are exhausted", () => {
  const chunkError = new Error("ChunkLoadError: Loading chunk 17 failed.");

  assert.equal(
    shouldShowRouteRetrySupportNotice(chunkError, APP_ROUTE_CHUNK_RETRY_MAX_ATTEMPTS - 1, false),
    false,
  );
  assert.equal(
    shouldShowRouteRetrySupportNotice(chunkError, APP_ROUTE_CHUNK_RETRY_MAX_ATTEMPTS, false),
    true,
  );
  assert.match(
    resolveRouteRetrySupportNotice(chunkError, APP_ROUTE_CHUNK_RETRY_MAX_ATTEMPTS, false),
    /Automatic recovery has already been attempted/i,
  );
});

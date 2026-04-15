import assert from "node:assert/strict";
import test from "node:test";
import {
  APP_ROUTE_CHUNK_RETRY_MAX_ATTEMPTS,
  isChunkLoadRouteError,
  resolveChunkLoadRetryDelayMs,
  shouldAutoRetryChunkLoadRoute,
} from "@/app/route-error-boundary-retry-utils";

test("isChunkLoadRouteError detects lazy bundle failures from common browser messages", () => {
  assert.equal(isChunkLoadRouteError(new Error("ChunkLoadError: Loading chunk 17 failed.")), true);
  assert.equal(isChunkLoadRouteError(new Error("Failed to fetch dynamically imported module")), true);
  assert.equal(isChunkLoadRouteError(new Error("Unexpected token < in JSON at position 0")), false);
});

test("resolveChunkLoadRetryDelayMs uses exponential backoff with a small ceiling", () => {
  assert.equal(resolveChunkLoadRetryDelayMs(0), 400);
  assert.equal(resolveChunkLoadRetryDelayMs(1), 800);
  assert.equal(resolveChunkLoadRetryDelayMs(2), 1_600);
  assert.equal(resolveChunkLoadRetryDelayMs(3), 1_600);
});

test("shouldAutoRetryChunkLoadRoute stops retrying after the reviewed maximum attempt count", () => {
  const chunkError = new Error("Importing a module script failed");
  assert.equal(shouldAutoRetryChunkLoadRoute(chunkError, 0), true);
  assert.equal(
    shouldAutoRetryChunkLoadRoute(chunkError, APP_ROUTE_CHUNK_RETRY_MAX_ATTEMPTS - 1),
    true,
  );
  assert.equal(
    shouldAutoRetryChunkLoadRoute(chunkError, APP_ROUTE_CHUNK_RETRY_MAX_ATTEMPTS),
    false,
  );
  assert.equal(shouldAutoRetryChunkLoadRoute(new Error("ordinary render failure"), 0), false);
});

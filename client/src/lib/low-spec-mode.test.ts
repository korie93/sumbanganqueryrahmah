import assert from "node:assert/strict";
import test from "node:test";
import { detectLowSpecMode } from "@/lib/low-spec-mode";

test("detectLowSpecMode falls back safely when device memory and connection hints are unsupported", () => {
  assert.equal(
    detectLowSpecMode({
      hardwareConcurrency: 8,
    } as Navigator),
    false,
  );
});

test("detectLowSpecMode enables low-spec mode when save-data is requested", () => {
  assert.equal(
    detectLowSpecMode({
      hardwareConcurrency: 8,
      connection: {
        saveData: true,
      },
    } as Navigator & { connection: { saveData: boolean } }),
    true,
  );
});

test("detectLowSpecMode enables low-spec mode on constrained hardware", () => {
  assert.equal(
    detectLowSpecMode({
      hardwareConcurrency: 2,
      deviceMemory: 8,
    } as Navigator & { deviceMemory: number }),
    true,
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveRouteErrorDescription,
  resolveRouteErrorTitle,
} from "@/app/route-error-boundary-utils";

test("resolveRouteErrorTitle maps internal route ids to user-friendly labels", () => {
  assert.equal(resolveRouteErrorTitle("backup"), "Sandaran & Pemulihan Menghadapi Masalah");
  assert.equal(resolveRouteErrorTitle("collection-report"), "Kutipan Menghadapi Masalah");
  assert.equal(resolveRouteErrorTitle("settings"), "Tetapan Menghadapi Masalah");
});

test("resolveRouteErrorDescription gives chunk-load guidance for lazy pages", () => {
  const description = resolveRouteErrorDescription(
    new Error("ChunkLoadError: Loading chunk 17 failed."),
  );

  assert.match(description, /Bundle halaman gagal dimuatkan/i);
  assert.match(description, /muat semula aplikasi/i);
});

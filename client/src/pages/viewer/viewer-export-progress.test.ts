import assert from "node:assert/strict";
import test from "node:test";
import { formatViewerExportProgress } from "@/pages/viewer/viewer-export-progress";

test("export preparation names the actual file format without inventing a percentage", () => {
  for (const [kind, label] of [["csv", "CSV"], ["excel", "Excel"], ["pdf", "PDF"]] as const) {
    assert.equal(formatViewerExportProgress({ kind, phase: "preparing" }), `Menyediakan fail ${label}…`);
  }
});

test("export loading text reports received rows rather than estimated elapsed progress", () => {
  for (const receivedRows of [0, 100, 200, 237]) {
    assert.equal(formatViewerExportProgress({
      kind: "csv", phase: "loading", receivedRows, expectedRows: 237,
    }), `Mengambil rekod: ${receivedRows} daripada 237`);
  }
});

test("export loading text groups larger received and expected counts consistently", () => {
  assert.equal(formatViewerExportProgress({
    kind: "excel", phase: "loading", receivedRows: 1200, expectedRows: 2500,
  }), "Mengambil rekod: 1,200 daripada 2,500");
});

test("export loading retains the actual received count when the dataset outgrows its initial total", () => {
  assert.equal(formatViewerExportProgress({
    kind: "pdf", phase: "loading", receivedRows: 300, expectedRows: 237,
  }), "Mengambil rekod: 300 rekod");
});

test("export loading omits an unavailable denominator rather than reporting a false total", () => {
  assert.equal(formatViewerExportProgress({
    kind: "csv", phase: "loading", receivedRows: 100, expectedRows: 0,
  }), "Mengambil rekod: 100 rekod");
});

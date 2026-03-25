import assert from "node:assert/strict";
import test from "node:test";
import { resolveGeneralSearchExportBlockReason } from "@/pages/general-search/export-guards";

test("resolveGeneralSearchExportBlockReason blocks empty exports", () => {
  assert.equal(
    resolveGeneralSearchExportBlockReason({
      resultsLength: 0,
      exportingPdf: false,
    }),
    "no_data",
  );
});

test("resolveGeneralSearchExportBlockReason blocks busy exports", () => {
  assert.equal(
    resolveGeneralSearchExportBlockReason({
      resultsLength: 10,
      exportingPdf: true,
    }),
    "busy",
  );
});

test("resolveGeneralSearchExportBlockReason allows export when data is ready", () => {
  assert.equal(
    resolveGeneralSearchExportBlockReason({
      resultsLength: 10,
      exportingPdf: false,
    }),
    null,
  );
});

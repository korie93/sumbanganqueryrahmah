import assert from "node:assert/strict";
import test from "node:test";
import { resolveDashboardExportBlockReason } from "@/pages/dashboard/export-guards";

test("resolveDashboardExportBlockReason blocks exports while dashboard work is already active", () => {
  assert.equal(
    resolveDashboardExportBlockReason({
      exportingPdf: true,
      refreshing: false,
    }),
    "busy",
  );

  assert.equal(
    resolveDashboardExportBlockReason({
      exportingPdf: false,
      refreshing: true,
    }),
    "busy",
  );
});

test("resolveDashboardExportBlockReason allows export when dashboard is idle", () => {
  assert.equal(
    resolveDashboardExportBlockReason({
      exportingPdf: false,
      refreshing: false,
    }),
    null,
  );
});

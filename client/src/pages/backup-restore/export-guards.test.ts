import assert from "node:assert/strict";
import test from "node:test";
import { resolveBackupsExportBlockReason } from "@/pages/backup-restore/export-guards";

test("resolveBackupsExportBlockReason blocks empty exports", () => {
  assert.equal(
    resolveBackupsExportBlockReason({
      backupsLength: 0,
      exportingPdf: false,
    }),
    "no_data",
  );
});

test("resolveBackupsExportBlockReason blocks busy exports", () => {
  assert.equal(
    resolveBackupsExportBlockReason({
      backupsLength: 10,
      exportingPdf: true,
    }),
    "busy",
  );
});

test("resolveBackupsExportBlockReason allows export when data is ready", () => {
  assert.equal(
    resolveBackupsExportBlockReason({
      backupsLength: 10,
      exportingPdf: false,
    }),
    null,
  );
});

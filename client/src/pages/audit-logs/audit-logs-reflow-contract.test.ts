import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const filtersPanelSource = readFileSync(
  path.resolve(process.cwd(), "client/src/pages/audit-logs/AuditLogsFiltersPanel.tsx"),
  "utf8",
);
const cleanupPanelSource = readFileSync(
  path.resolve(process.cwd(), "client/src/pages/audit-logs/AuditLogsCleanupPanel.tsx"),
  "utf8",
);

test("audit log collapsible headings can reflow without clipping", () => {
  for (const source of [filtersPanelSource, cleanupPanelSource]) {
    assert.match(source, /h-auto min-w-0 w-full/);
    assert.match(source, /whitespace-normal/);
  }
});

test("audit log cleanup action remains bounded when its label wraps", () => {
  assert.match(
    cleanupPanelSource,
    /min-h-11 h-auto w-full max-w-full whitespace-normal py-2 text-center lg:w-auto/,
  );
});

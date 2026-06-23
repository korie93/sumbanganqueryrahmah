import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readClientSource(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, relativePath), "utf8");
}

test("data-heavy truncated rows expose title and aria-label text", () => {
  const sourcePaths = [
    "../pages/activity/ActivityMobileLogsList.tsx",
    "../pages/activity/ActivityDesktopLogRow.tsx",
    "../pages/viewer/ViewerVirtualizedRow.tsx",
    "../pages/viewer/ViewerVirtualizedTable.tsx",
    "../pages/backup-restore/BackupListItem.tsx",
    "../pages/audit-logs/AuditLogRecordCard.tsx",
    "../pages/import/BulkImportPanel.tsx",
    "../pages/collection/CollectionReceiptPanel.tsx",
    "../pages/collection/CollectionDailyDayDetailsDialogParts.tsx",
    "../pages/dashboard/DashboardUserInsightsGrid.tsx",
    "../pages/dashboard/DashboardChartsGridParts.tsx",
    "../components/NavbarParts.tsx",
  ];

  for (const sourcePath of sourcePaths) {
    const source = readClientSource(sourcePath);

    assert.match(source, /className="[^"]*truncate[^"]*"[\s\S]{0,220}title=/);
    assert.match(source, /className="[^"]*truncate[^"]*"[\s\S]{0,260}aria-label=/);
  }
});

test("collection day metric truncation labels use a non-empty value fallback", () => {
  const source = readClientSource("../pages/collection/CollectionDailyDayDetailsDialogParts.tsx");

  assert.match(source, /function formatMetricValueLabel\(value: string \| number\)/);
  assert.match(source, /return normalized \|\| "No value";/);
  assert.match(source, /const valueLabel = formatMetricValueLabel\(value\);/);
  assert.match(source, /title=\{valueLabel\}/);
  assert.match(source, /aria-label=\{valueLabel\}/);
  assert.doesNotMatch(source, /title=\{String\(value\)\}/);
  assert.doesNotMatch(source, /aria-label=\{String\(value\)\}/);
});

test("viewer truncated cells use the shared non-empty value formatter", () => {
  const source = readClientSource("../pages/viewer/ViewerVirtualizedRow.tsx");

  assert.match(source, /const cellText = formatViewerCellValue\(row\[header\]\);/);
  assert.match(source, /title=\{cellText\}/);
  assert.match(source, /aria-label=\{cellText\}/);
  assert.doesNotMatch(source, /String\(row\[header\] \?\? "-"\)/);
});

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

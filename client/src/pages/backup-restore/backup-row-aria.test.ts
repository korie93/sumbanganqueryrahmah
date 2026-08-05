import assert from "node:assert/strict";
import test from "node:test";
import { buildBackupRowAriaLabel } from "@/pages/backup-restore/backup-row-aria";
import { normalizeBackup } from "@/pages/backup-restore/utils";

test("buildBackupRowAriaLabel summarizes backup metadata", () => {
  assert.equal(
    buildBackupRowAriaLabel({
      backup: {
        createdAt: "2026-04-14T00:00:00.000Z",
        createdBy: "superuser",
        id: "backup-1",
        metadata: {
          auditLogsCount: 75,
          collectionRecordPurgeHistoryCount: 7,
          collectionRecordReceiptsCount: 0,
          collectionRecordsCount: 18,
          createdAt: "2026-04-14T00:00:00.000Z",
          dataRowsCount: 1200,
          importsCount: 12,
          usersCount: 8,
        },
        name: "Nightly Backup",
      },
      formattedCreatedAt: "14/04/2026, 08:00 PM",
    }),
    "Backup Nightly Backup, created by superuser, created 14/04/2026, 08:00 PM, 12 imports, 1200 data rows, 8 users, 75 audit logs, 18 collection records, 7 collection history records",
  );
});

test("normalizeBackup supplies safe labels for blank legacy metadata", () => {
  const backup = normalizeBackup({
    id: "backup-legacy",
    name: "  ",
    createdAt: "2026-04-14T00:00:00.000Z",
    createdBy: "\n",
  });

  assert.equal(backup.name, "Unnamed backup");
  assert.equal(backup.createdBy, "system");
  assert.equal(
    buildBackupRowAriaLabel({
      backup,
      formattedCreatedAt: "14/04/2026, 08:00 PM",
    }),
    "Backup Unnamed backup, created by system, created 14/04/2026, 08:00 PM",
  );
});

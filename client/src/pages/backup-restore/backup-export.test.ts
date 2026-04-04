import assert from "node:assert/strict";
import test from "node:test";
import type { BackupRecord } from "@/pages/backup-restore/types";
import { buildBackupsCsvContent } from "@/pages/backup-restore/backup-export";

const sampleBackups: BackupRecord[] = [
  {
    id: "backup-1",
    name: 'Nightly "Alpha"',
    createdAt: "2026-03-29T16:30:00.000Z",
    createdBy: "superuser",
    metadata: {
      importsCount: 3,
      dataRowsCount: 42,
      usersCount: 2,
      auditLogsCount: 5,
      createdAt: "2026-03-29T16:30:00.000Z",
    },
  },
];

test("buildBackupsCsvContent includes headers and localized timestamps", () => {
  const csvContent = buildBackupsCsvContent(sampleBackups);

  assert.match(csvContent, /^"Name","Created By","Created At","Imports","Data Rows","Users","Audit Logs"/);
  assert.match(csvContent, /"30\/03\/2026, 12:30:00 AM"/);
});

test("buildBackupsCsvContent escapes quotes safely", () => {
  const csvContent = buildBackupsCsvContent(sampleBackups);

  assert.match(csvContent, /"Nightly ""Alpha"""/);
});

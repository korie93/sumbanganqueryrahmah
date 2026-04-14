import type { BackupRecord } from "@/pages/backup-restore/types";

type BackupRowAriaOptions = {
  backup: BackupRecord;
  formattedCreatedAt: string;
};

export function buildBackupRowAriaLabel({
  backup,
  formattedCreatedAt,
}: BackupRowAriaOptions) {
  const details = [
    `Backup ${backup.name}`,
    `created by ${backup.createdBy}`,
    `created ${formattedCreatedAt}`,
  ];

  if (backup.metadata) {
    details.push(`${backup.metadata.importsCount} imports`);
    details.push(`${backup.metadata.dataRowsCount} data rows`);
    details.push(`${backup.metadata.usersCount} users`);
    details.push(`${backup.metadata.auditLogsCount} audit logs`);
    if (backup.metadata.collectionRecordsCount) {
      details.push(`${backup.metadata.collectionRecordsCount} collection records`);
    }
  }

  return details.join(", ");
}

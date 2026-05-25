import type { BackupsResponse } from "./types";

export function removeBackupFromBackupsResponse(
  response: BackupsResponse | undefined,
  backupId: string,
): BackupsResponse | undefined {
  if (!response) {
    return response;
  }

  const nextBackups = response.backups.filter((backup) => backup.id !== backupId);

  if (nextBackups.length === response.backups.length) {
    return response;
  }

  const removedCount = response.backups.length - nextBackups.length;
  const nextTotal = Math.max(0, response.pagination.total - removedCount);
  const pageSize = Math.max(1, response.pagination.pageSize);
  const totalPages = Math.max(1, Math.ceil(nextTotal / pageSize));

  return {
    ...response,
    backups: nextBackups,
    pagination: {
      ...response.pagination,
      page: Math.min(Math.max(1, response.pagination.page), totalPages),
      total: nextTotal,
      totalPages,
    },
  };
}

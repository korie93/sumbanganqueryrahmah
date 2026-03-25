export function resolveBackupsExportBlockReason(options: {
  backupsLength: number;
  exportingPdf: boolean;
}) {
  if (options.backupsLength === 0) {
    return "no_data";
  }

  if (options.exportingPdf) {
    return "busy";
  }

  return null;
}

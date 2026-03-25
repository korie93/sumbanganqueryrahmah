export function resolveAuditLogsExportBlockReason(options: {
  logsLength: number;
  exportingPdf: boolean;
}) {
  if (options.logsLength === 0) {
    return "no_data";
  }

  if (options.exportingPdf) {
    return "busy";
  }

  return null;
}

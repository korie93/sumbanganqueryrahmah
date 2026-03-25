export function resolveDashboardExportBlockReason(options: {
  exportingPdf: boolean;
  refreshing: boolean;
}) {
  if (options.exportingPdf || options.refreshing) {
    return "busy";
  }

  return null;
}

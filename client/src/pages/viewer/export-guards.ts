export function resolveViewerExportBlockReason(options: {
  rowsLength: number;
  exportingExcel: boolean;
  exportingPdf: boolean;
}) {
  if (options.rowsLength === 0) {
    return "no_data";
  }

  if (options.exportingExcel || options.exportingPdf) {
    return "busy";
  }

  return null;
}

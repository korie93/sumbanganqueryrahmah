export function resolveGeneralSearchExportBlockReason(options: {
  resultsLength: number;
  exportingPdf: boolean;
}) {
  if (options.resultsLength === 0) {
    return "no_data";
  }

  if (options.exportingPdf) {
    return "busy";
  }

  return null;
}

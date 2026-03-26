export function resolveViewerExportBlockReason(options: {
  totalRows: number;
  filteredRowsLength: number;
  selectedRowsLength: number;
  exportFiltered?: boolean;
  exportSelected?: boolean;
  exportingExcel: boolean;
  exportingPdf: boolean;
}) {
  if (options.exportingExcel || options.exportingPdf) {
    return "busy";
  }

  if (options.exportSelected) {
    return options.selectedRowsLength === 0 ? "no_data" : null;
  }

  if (options.exportFiltered) {
    return options.filteredRowsLength === 0 && options.totalRows === 0 ? "no_data" : null;
  }

  if (options.totalRows === 0) {
    return "no_data";
  }

  return null;
}

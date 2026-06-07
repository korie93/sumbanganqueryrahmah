export type DashboardExportBlockReason = "busy";

export function resolveDashboardExportBlockReason(options: {
  exportingPdf: boolean;
  refreshing: boolean;
}): DashboardExportBlockReason | null {
  if (options.exportingPdf || options.refreshing) {
    return "busy";
  }

  return null;
}

export function resolveDashboardExportStatusMessage(options: {
  exportBlockReason: DashboardExportBlockReason | null;
  exportingPdf: boolean;
  refreshing: boolean;
}) {
  if (options.exportingPdf) {
    return "Sedang jana PDF. Jangan tutup halaman sehingga muat turun selesai.";
  }

  if (options.refreshing) {
    return "Refresh sedang berjalan. Export PDF akan aktif selepas data stabil.";
  }

  if (options.exportBlockReason === "busy") {
    return "Export PDF belum tersedia kerana dashboard sedang memproses.";
  }

  return "PDF sedia untuk dijana dengan ringkasan dashboard semasa.";
}

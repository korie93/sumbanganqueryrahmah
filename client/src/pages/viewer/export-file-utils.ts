export type ViewerExportExtension = "csv" | "pdf" | "xlsx";

let viewerJsPdfModulePromise: Promise<typeof import("jspdf")> | null = null;
let viewerXlsxModulePromise: Promise<typeof import("xlsx")> | null = null;

export function loadViewerJsPdfModule() {
  if (!viewerJsPdfModulePromise) {
    viewerJsPdfModulePromise = import("jspdf");
  }

  return viewerJsPdfModulePromise;
}

export function loadViewerXlsxModule() {
  if (!viewerXlsxModulePromise) {
    viewerXlsxModulePromise = import("xlsx");
  }

  return viewerXlsxModulePromise;
}

export function buildViewerExportFilename(
  importName: string,
  extension: ViewerExportExtension,
  exportFiltered = false,
  exportSelected = false,
) {
  let filename = `SQR-${importName || "export"}`;
  if (exportFiltered) filename += "-filtered";
  if (exportSelected) filename += "-selected";
  return `${filename}-${new Date().toISOString().split("T")[0]}.${extension}`;
}

export function resolveViewerPotentialIcColumns(headers: string[]) {
  const icPatterns = /^(ic|no\.?\s*kp|no\.?\s*ic|id\s*no|ic\s*no|no\s*pengenalan|kad\s*pengenalan)/i;

  return headers.filter((header) => icPatterns.test(header.replace(/[_-]/g, " ")));
}

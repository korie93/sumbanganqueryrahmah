import { createRetryableModuleLoader } from "@/lib/retryable-module-loader";
export type ViewerExportExtension = "csv" | "pdf" | "xlsx";

const loadViewerJsPdfModuleInternal = createRetryableModuleLoader<typeof import("jspdf")>(
  () => import("jspdf"),
);
const loadViewerXlsxModuleInternal = createRetryableModuleLoader<typeof import("xlsx")>(
  () => import("xlsx"),
);

export function loadViewerJsPdfModule() {
  return loadViewerJsPdfModuleInternal();
}

export function loadViewerXlsxModule() {
  return loadViewerXlsxModuleInternal();
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

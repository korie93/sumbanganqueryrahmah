import type { ViewerExportKind } from "@/pages/viewer/viewer-export-lifecycle";

export type ViewerExportProgress = {
  kind: ViewerExportKind;
} & ({
  phase: "loading";
  receivedRows: number;
  expectedRows: number;
} | {
  phase: "preparing";
});

const formatNames: Record<ViewerExportKind, string> = { csv: "CSV", excel: "Excel", pdf: "PDF" };

export function formatViewerExportProgress(progress: ViewerExportProgress) {
  if (progress.phase === "preparing") return `Menyediakan fail ${formatNames[progress.kind]}…`;

  const received = progress.receivedRows.toLocaleString("en-MY");
  // The dataset may grow during export. Keep the actual count rather than clamp
  // it or claim a percentage against an outdated total from the initial view.
  if (progress.expectedRows < progress.receivedRows || progress.expectedRows <= 0) {
    return `Mengambil rekod: ${received} rekod`;
  }
  return `Mengambil rekod: ${received} daripada ${progress.expectedRows.toLocaleString("en-MY")}`;
}

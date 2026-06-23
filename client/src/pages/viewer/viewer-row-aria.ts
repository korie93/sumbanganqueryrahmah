import type { DataRowWithId } from "@/pages/viewer/types";
import { buildViewerVisibleFieldsSummary } from "@/pages/viewer/viewer-table-utils";

type ViewerRowAriaOptions = {
  row: DataRowWithId;
  visibleHeaders: string[];
};

export function formatViewerCellValue(value: unknown) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalized || "-";
}

function normalizeViewerCellValue(value: unknown) {
  const normalized = formatViewerCellValue(value);
  if (normalized.length <= 48) {
    return normalized;
  }
  return `${normalized.slice(0, 45)}...`;
}

export function buildViewerRowAriaLabel({
  row,
  visibleHeaders,
}: ViewerRowAriaOptions) {
  const previewFields = visibleHeaders.slice(0, 3);
  const details = [`Viewer row ${row.__rowId + 1}`];

  for (const header of previewFields) {
    details.push(`${header} ${normalizeViewerCellValue(row[header])}`);
  }

  details.push(buildViewerVisibleFieldsSummary(visibleHeaders.length));
  return details.join(", ");
}

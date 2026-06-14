import type { ImportItem } from "@/pages/saved/types";

export const SAVED_WORKSPACE_VIEWS = [
  "all",
  "recent",
  "large",
  "duplicates",
  "review",
] as const;

export type SavedWorkspaceView = (typeof SAVED_WORKSPACE_VIEWS)[number];

export type SavedWorkspaceSummary = {
  loadedFiles: number;
  totalFiles: number;
  loadedRows: number;
  loadedSizeBytes: number | null;
  recentCount: number;
  largeCount: number;
  duplicateCount: number;
  reviewCount: number;
  hasPartialLoad: boolean;
};

export type SavedImportStatus = {
  label: string;
  tone: "default" | "success" | "warning" | "danger";
};

const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const LARGE_FILE_BYTES = 10 * 1024 * 1024;
const LARGE_FILE_ROWS = 10_000;

export function getSavedImportSizeBytes(item: ImportItem) {
  const size = item.sourceSizeBytes;
  return typeof size === "number" && Number.isFinite(size) && size >= 0
    ? Math.trunc(size)
    : null;
}

export function formatSavedFileSize(sizeBytes: number | null | undefined) {
  if (typeof sizeBytes !== "number" || !Number.isFinite(sizeBytes) || sizeBytes < 0) {
    return "Size unknown";
  }

  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  const units = ["KB", "MB", "GB"] as const;
  let value = sizeBytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

export function buildSavedDuplicateHashCounts(imports: ImportItem[]) {
  const counts = new Map<string, number>();
  for (const item of imports) {
    const hash = String(item.contentHashSha256 || "").trim().toLowerCase();
    if (/^[a-f0-9]{64}$/.test(hash)) {
      counts.set(hash, (counts.get(hash) ?? 0) + 1);
    }
  }
  return counts;
}

export function isSavedImportDuplicate(
  item: ImportItem,
  duplicateHashCounts: ReadonlyMap<string, number>,
) {
  if (item.isDuplicate === true) {
    return true;
  }
  const hash = String(item.contentHashSha256 || "").trim().toLowerCase();
  return hash !== "" && (duplicateHashCounts.get(hash) ?? 0) > 1;
}

export function isSavedImportRecent(item: ImportItem, now = new Date()) {
  const createdAt = new Date(item.createdAt);
  if (Number.isNaN(createdAt.getTime())) {
    return false;
  }
  const ageMs = now.getTime() - createdAt.getTime();
  return ageMs >= 0 && ageMs <= RECENT_WINDOW_MS;
}

export function isSavedImportLarge(item: ImportItem) {
  const sizeBytes = getSavedImportSizeBytes(item);
  const rows = typeof item.rowCount === "number" ? item.rowCount : 0;
  return (sizeBytes ?? 0) >= LARGE_FILE_BYTES || rows >= LARGE_FILE_ROWS;
}

export function isSavedImportNeedsReview(item: ImportItem) {
  const rows = typeof item.rowCount === "number" ? item.rowCount : null;
  return rows === 0;
}

export function getSavedImportStatus(
  item: ImportItem,
  duplicateHashCounts: ReadonlyMap<string, number>,
): SavedImportStatus {
  if (isSavedImportNeedsReview(item)) {
    return { label: "Needs review", tone: "warning" };
  }
  if (isSavedImportDuplicate(item, duplicateHashCounts)) {
    return { label: "Duplicate", tone: "danger" };
  }
  if (isSavedImportLarge(item)) {
    return { label: "Large file", tone: "default" };
  }
  return { label: "Ready", tone: "success" };
}

export function filterSavedImportsByWorkspaceView(
  imports: ImportItem[],
  view: SavedWorkspaceView,
  now = new Date(),
) {
  const duplicateHashCounts = buildSavedDuplicateHashCounts(imports);
  if (view === "all") return imports;
  if (view === "recent") return imports.filter((item) => isSavedImportRecent(item, now));
  if (view === "large") return imports.filter(isSavedImportLarge);
  if (view === "duplicates") {
    return imports.filter((item) => isSavedImportDuplicate(item, duplicateHashCounts));
  }
  return imports.filter(isSavedImportNeedsReview);
}

export function resolveSavedActiveImportId(
  imports: ImportItem[],
  activeImportId: string | null,
) {
  if (!activeImportId) {
    return null;
  }

  return imports.some((item) => item.id === activeImportId)
    ? activeImportId
    : null;
}

export function buildSavedWorkspaceSummary(
  imports: ImportItem[],
  totalFiles: number,
  hasMoreImports: boolean,
  now = new Date(),
): SavedWorkspaceSummary {
  const duplicateHashCounts = buildSavedDuplicateHashCounts(imports);
  const loadedSizeBytes = imports.reduce<number | null>((total, item) => {
    const sizeBytes = getSavedImportSizeBytes(item);
    return sizeBytes === null ? total : (total ?? 0) + sizeBytes;
  }, null);

  return {
    loadedFiles: imports.length,
    totalFiles,
    loadedRows: imports.reduce((total, item) => total + Math.max(0, Number(item.rowCount || 0)), 0),
    loadedSizeBytes,
    recentCount: imports.filter((item) => isSavedImportRecent(item, now)).length,
    largeCount: imports.filter(isSavedImportLarge).length,
    duplicateCount: imports.filter((item) => isSavedImportDuplicate(item, duplicateHashCounts)).length,
    reviewCount: imports.filter(isSavedImportNeedsReview).length,
    hasPartialLoad: (hasMoreImports || imports.length < totalFiles) && imports.length < totalFiles,
  };
}

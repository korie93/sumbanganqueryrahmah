import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSavedDuplicateHashCounts,
  buildSavedWorkspaceSummary,
  filterSavedImportsByWorkspaceView,
  formatSavedFileSize,
  getSavedImportStatus,
  resolveSavedActiveImportId,
} from "@/pages/saved/saved-workspace";
import type { ImportItem } from "@/pages/saved/types";

const duplicateHash = "a".repeat(64);
const now = new Date("2026-06-14T00:00:00.000Z");

const imports: ImportItem[] = [
  {
    id: "recent",
    name: "Recent Upload",
    filename: "recent.xlsx",
    createdAt: "2026-06-13T12:00:00.000Z",
    rowCount: 120,
    sourceSizeBytes: 2048,
  },
  {
    id: "large",
    name: "Large Upload",
    filename: "large.xlsx",
    createdAt: "2026-05-01T00:00:00.000Z",
    rowCount: 12_000,
    sourceSizeBytes: 12 * 1024 * 1024,
  },
  {
    id: "duplicate-a",
    name: "Duplicate A",
    filename: "dup-a.xlsx",
    createdAt: "2026-05-02T00:00:00.000Z",
    rowCount: 10,
    contentHashSha256: duplicateHash,
  },
  {
    id: "duplicate-b",
    name: "Duplicate B",
    filename: "dup-b.xlsx",
    createdAt: "2026-05-03T00:00:00.000Z",
    rowCount: 10,
    contentHashSha256: duplicateHash,
  },
  {
    id: "review",
    name: "Needs Review",
    filename: "empty.xlsx",
    createdAt: "2026-05-04T00:00:00.000Z",
    rowCount: 0,
  },
];

test("saved workspace summary classifies loaded imports without exposing hashes", () => {
  const summary = buildSavedWorkspaceSummary(imports, 9, true, now);

  assert.equal(summary.loadedFiles, 5);
  assert.equal(summary.totalFiles, 9);
  assert.equal(summary.hasPartialLoad, true);
  assert.equal(summary.loadedRows, 12_140);
  assert.equal(summary.recentCount, 1);
  assert.equal(summary.largeCount, 1);
  assert.equal(summary.duplicateCount, 2);
  assert.equal(summary.reviewCount, 1);
});

test("saved workspace filters by compact management view", () => {
  assert.deepEqual(filterSavedImportsByWorkspaceView(imports, "recent", now).map((item) => item.id), [
    "recent",
  ]);
  assert.deepEqual(filterSavedImportsByWorkspaceView(imports, "large", now).map((item) => item.id), [
    "large",
  ]);
  assert.deepEqual(filterSavedImportsByWorkspaceView(imports, "duplicates", now).map((item) => item.id), [
    "duplicate-a",
    "duplicate-b",
  ]);
  assert.deepEqual(filterSavedImportsByWorkspaceView(imports, "review", now).map((item) => item.id), [
    "review",
  ]);
});

test("saved import status favors actionable review and duplicate labels", () => {
  const duplicateCounts = buildSavedDuplicateHashCounts(imports);

  assert.equal(getSavedImportStatus(imports[0], duplicateCounts).label, "Ready");
  assert.equal(getSavedImportStatus(imports[1], duplicateCounts).label, "Large file");
  assert.equal(getSavedImportStatus(imports[2], duplicateCounts).label, "Duplicate");
  assert.equal(getSavedImportStatus(imports[4], duplicateCounts).label, "Needs review");
});

test("saved file size formatting handles unknown and large values", () => {
  assert.equal(formatSavedFileSize(null), "Size unknown");
  assert.equal(formatSavedFileSize(512), "512 B");
  assert.equal(formatSavedFileSize(2048), "2.0 KB");
  assert.equal(formatSavedFileSize(12 * 1024 * 1024), "12 MB");
});

test("saved workspace preserves an older active file instead of resetting to the latest", () => {
  assert.equal(resolveSavedActiveImportId(imports, "duplicate-b"), "duplicate-b");
  assert.equal(resolveSavedActiveImportId(imports, null), "recent");
  assert.equal(resolveSavedActiveImportId(imports, "missing"), "recent");
  assert.equal(resolveSavedActiveImportId([], "duplicate-b"), null);
});

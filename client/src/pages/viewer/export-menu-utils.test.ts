import assert from "node:assert/strict";
import test from "node:test";
import { buildViewerExportMenuSections } from "@/pages/viewer/export-menu-utils";

test("buildViewerExportMenuSections includes all, filtered, and selected variants when available", () => {
  const sections = buildViewerExportMenuSections({
    exportBusy: false,
    totalRows: 120,
    filteredRowsCount: 12,
    selectedRowCount: 3,
    hasFilteredSubset: true,
  });

  assert.equal(sections.length, 3);
  assert.deepEqual(
    sections.map((section) => section.id),
    ["csv", "pdf", "excel"],
  );
  assert.deepEqual(
    sections[0]?.options.map((option) => option.id),
    ["csv-all", "csv-filtered", "csv-selected"],
  );
  assert.deepEqual(
    sections[1]?.options.map((option) => option.id),
    ["pdf-all", "pdf-filtered", "pdf-selected"],
  );
});

test("buildViewerExportMenuSections disables only pdf and excel options while export is busy", () => {
  const sections = buildViewerExportMenuSections({
    exportBusy: true,
    totalRows: 50,
    filteredRowsCount: 50,
    selectedRowCount: 0,
    hasFilteredSubset: false,
  });

  const csvOptions = sections.find((section) => section.id === "csv")?.options ?? [];
  const pdfOptions = sections.find((section) => section.id === "pdf")?.options ?? [];
  const excelOptions = sections.find((section) => section.id === "excel")?.options ?? [];

  assert.equal(csvOptions.every((option) => option.disabled === false), true);
  assert.equal(pdfOptions.every((option) => option.disabled === true), true);
  assert.equal(excelOptions.every((option) => option.disabled === true), true);
});

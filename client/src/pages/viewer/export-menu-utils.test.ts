import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildViewerExportMenuSections } from "@/pages/viewer/export-menu-utils";
import { ViewerExportOptionsList } from "@/pages/viewer/ViewerExportOptionsList";

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

test("export scopes name all matching results, only this page and selected records with exact formatted counts", () => {
  const sections = buildViewerExportMenuSections({ exportBusy: false, totalRows: 1200,
    filteredRowsCount: 25, selectedRowCount: 3, hasFilteredSubset: true });
  for (const section of sections) {
    assert.deepEqual(section.options.map(({ label, exportFiltered, exportSelected }) =>
      ({ label, exportFiltered, exportSelected })), [
      { label: "Semua keputusan carian — 1,200 rekod", exportFiltered: false, exportSelected: false },
      { label: "Paparan halaman ini — 25 rekod", exportFiltered: true, exportSelected: false },
      { label: "Rekod dipilih — 3 rekod", exportFiltered: true, exportSelected: true },
    ]);
  }
});

test("unfiltered exports say all data and retain the existing conditional scope choices", () => {
  for (const totalRows of [0, 1, 1200]) {
    const sections = buildViewerExportMenuSections({ exportBusy: false, totalRows,
      filteredRowsCount: Math.min(totalRows, 25), selectedRowCount: 0, hasFilteredSubset: false });
    for (const section of sections) {
      assert.equal(section.options.length, 1);
      assert.equal(section.options[0]?.label, `Semua data — ${totalRows.toLocaleString("en-MY")} rekod`);
      assert.equal(section.options[0]?.exportFiltered, false);
      assert.equal(section.options[0]?.exportSelected, false);
    }
  }
});

test("standalone export choices wrap labels and associate one hint only with current-page options", () => {
  const sections = buildViewerExportMenuSections({ exportBusy: false, totalRows: 795,
    filteredRowsCount: 25, selectedRowCount: 3, hasFilteredSubset: true });
  const markup = renderToStaticMarkup(createElement(ViewerExportOptionsList, {
    headersCount: 43, selectedColumnsCount: 5, sections, onRunExport: () => {},
  }));
  assert.equal((markup.match(/Paparan halaman ini hanya mengeksport/g) ?? []).length, 1);
  assert.equal((markup.match(/aria-describedby=/g) ?? []).length, 3);
  const hintId = markup.match(/<p id="([^"]+)"[^>]*>Paparan halaman ini hanya/)?.[1];
  assert.ok(hintId);
  for (const format of ["csv", "pdf", "excel"]) {
    const pageButton = markup.match(new RegExp(`<button[^>]*data-testid="button-export-${format}-filtered"[^>]*>`))?.[0];
    assert.ok(pageButton);
    assert.ok(pageButton.includes(`aria-describedby="${hintId}"`));
    assert.match(pageButton, /whitespace-normal/);
  }
});

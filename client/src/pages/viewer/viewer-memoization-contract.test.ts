import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readViewerSource(fileName: string): string {
  return readFileSync(path.resolve(__dirname, fileName), "utf8");
}

test("viewer table shell memoizes stable render data and fallbacks", () => {
  const source = readViewerSource("ViewerDataTable.tsx");
  const styleSource = readViewerSource("ViewerDataTable.module.css");

  assert.match(source, /import\s+\{[^}]*memo[^}]*useMemo[^}]*\}\s+from "react"/);
  assert.match(source, /const virtualRowData = useMemo<ViewerVirtualRowData>/);
  assert.match(source, /const desktopTableFallback = useMemo\(/);
  assert.match(source, /const mobileTableFallback = useMemo\(/);
  assert.match(source, /ariaLabel="Viewer data columns"/);
  assert.match(source, /showScrollbar/);
  assert.match(source, /className=\{styles\.desktopTableWidth\}/);
  assert.match(styleSource, /min-width:\s*max\(100%, var\(--viewer-table-min-width, 0px\)\)/);
  assert.match(source, /export const ViewerDataTable = memo\(ViewerDataTableImpl\)/);
});

test("viewer standard table isolates row selection rerenders", () => {
  const source = readViewerSource("ViewerStandardTable.tsx");

  assert.match(source, /const ViewerStandardTableRow = memo\(function ViewerStandardTableRow/);
  assert.match(source, /const rowAriaLabel = useMemo\(/);
  assert.match(source, /const handleToggleRow = useCallback\(/);
  assert.match(source, /ops-data-table w-full table-fixed text-sm/);
  assert.match(source, /aria-label=\{`Select row \$\{row\.__rowId \+ 1\}`\}/);
  assert.match(source, /aria-label="Select all filtered rows"/);
  assert.match(source, /className="truncate whitespace-nowrap p-3/);
  assert.match(source, /title=\{header\}/);
  assert.match(source, /selected=\{selectedRowIds\.has\(row\.__rowId\)\}/);
  assert.match(source, /export const ViewerStandardTable = memo\(ViewerStandardTableImpl\)/);
});

test("viewer mobile cards memoize per-card computed fields and callbacks", () => {
  const cardSource = readViewerSource("ViewerMobileCard.tsx");
  const tableSource = readViewerSource("ViewerMobileCardsTable.tsx");

  assert.match(cardSource, /const previewHeaders = useMemo\(\(\) => visibleHeaders\.slice\(0, 4\)/);
  assert.match(cardSource, /const overflowHeaders = useMemo\(\(\) => visibleHeaders\.slice\(4\)/);
  assert.match(cardSource, /const handleToggleRow = useCallback\(/);
  assert.match(cardSource, /export const ViewerMobileCard = memo\(ViewerMobileCardImpl\)/);
  assert.match(tableSource, /export const ViewerMobileCardsTable = memo\(ViewerMobileCardsTableImpl\)/);
});

test("viewer export menu memoizes derived sections and run handlers", () => {
  const source = readViewerSource("ViewerExportMenu.tsx");

  assert.match(source, /const sections = useMemo\(/);
  assert.match(source, /const runExport = useCallback\(/);
  assert.match(source, /const runMobileExport = useCallback\(/);
  assert.match(source, /const runDesktopExport = useCallback\(/);
  assert.match(source, /onRunExport=\{runMobileExport\}/);
  assert.match(source, /onRunExport=\{runDesktopExport\}/);
  assert.match(source, /export const ViewerExportMenu = memo\(ViewerExportMenuImpl\)/);
});

test("viewer controls use stable item callbacks", () => {
  const filterRowSource = readViewerSource("ViewerFilterRow.tsx");
  const columnListSource = readViewerSource("ViewerColumnSelectorList.tsx");
  const searchSource = readViewerSource("ViewerSearchBar.tsx");

  assert.match(filterRowSource, /const handleColumnChange = useCallback\(/);
  assert.match(filterRowSource, /const handleOperatorChange = useCallback\(/);
  assert.match(filterRowSource, /const handleValueChange = useCallback\(/);
  assert.match(filterRowSource, /export const ViewerFilterRow = memo\(ViewerFilterRowImpl\)/);
  assert.match(columnListSource, /const ViewerColumnSelectorItem = memo\(function ViewerColumnSelectorItem/);
  assert.match(columnListSource, /const handleToggleColumn = useCallback\(/);
  assert.match(columnListSource, /const handleMoveUp = useCallback\(/);
  assert.match(columnListSource, /const handleMoveDown = useCallback\(/);
  assert.match(searchSource, /const handleSearchInputChange = useCallback\(/);
});

test("viewer search and filter controls expose explicit accessible labels", () => {
  const filterRowSource = readViewerSource("ViewerFilterRow.tsx");
  const searchSource = readViewerSource("ViewerSearchBar.tsx");

  assert.match(searchSource, /htmlFor="viewer-search-query"/);
  assert.match(searchSource, /Search all rows/);
  assert.match(filterRowSource, /viewer-filter-column-label-/);
  assert.match(filterRowSource, /aria-labelledby=\{columnLabelId\}/);
  assert.match(filterRowSource, /viewer-filter-operator-label-/);
  assert.match(filterRowSource, /aria-labelledby=\{operatorLabelId\}/);
  assert.match(filterRowSource, /htmlFor=\{valueInputId\}/);
});

test("viewer page state avoids object-wide dependencies for active filter chips", () => {
  const source = readViewerSource("useViewerPageState.ts");

  assert.match(source, /const handleClearSearchFilter = useCallback\(/);
  assert.match(source, /\[data\.activeColumnFilters, data\.removeFilter, data\.search, handleClearSearchFilter\]/);
  assert.doesNotMatch(source, /\[data, exportState\]/);
  assert.doesNotMatch(source, /buildViewerActiveFilterChips\(\{[\s\S]*?\}\),\s*\[data\]/);
  assert.match(source, /readViewerColumnPreference/);
  assert.match(source, /writeViewerColumnPreference/);
});

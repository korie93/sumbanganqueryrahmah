import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readClientSource(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, relativePath), "utf8");
}

test("bulk import progress and dropzone expose keyboard and progress semantics", () => {
  const source = readClientSource("../pages/import/BulkImportPanel.tsx");

  assert.match(source, /focus-visible:ring-2/);
  assert.match(source, /aria-valuemin=\{0\}/);
  assert.match(source, /aria-valuemax=\{100\}/);
  assert.match(source, /aria-valuenow=\{roundedBulkProgress\}/);
  assert.match(source, /aria-valuetext=\{`\$\{roundedBulkProgress\}% processed`\}/);
});

test("viewer virtualized rows are memoized with react-window row equality", () => {
  const source = readClientSource("../pages/viewer/ViewerVirtualizedRow.tsx");

  assert.match(source, /function areVirtualizedRowPropsEqual\(/);
  assert.match(source, /previous\.style\.top === next\.style\.top/);
  assert.match(source, /export const ViewerVirtualizedRow = memo\(ViewerVirtualizedRowImpl, areVirtualizedRowPropsEqual\)/);
});

test("collection month details dialog uses viewport tokens and consistent sticky header tokens", () => {
  const dialogSource = readClientSource("../pages/collection-summary/CollectionMonthDetailsDialog.tsx");
  const tableSource = readClientSource("../pages/collection-summary/CollectionMonthDetailsDesktopTable.tsx");

  assert.doesNotMatch(dialogSource, /h-\[88vh\]/);
  assert.match(dialogSource, /h-\[calc\(var\(--viewport-min-height-value\)-2rem\)\]/);
  assert.match(tableSource, /const stickyHeaderClassName = "sticky top-0 z-\[var\(--z-sticky-header\)\]/);
});

test("route error boundary announces failures as an atomic alert", () => {
  const source = readClientSource("../app/AppRouteErrorBoundary.tsx");

  assert.match(source, /role="alert"/);
  assert.match(source, /aria-live="assertive"/);
  assert.match(source, /aria-atomic="true"/);
  assert.match(source, /aria-labelledby="app-route-error-boundary-title"/);
  assert.match(source, /aria-describedby="app-route-error-boundary-description"/);
});

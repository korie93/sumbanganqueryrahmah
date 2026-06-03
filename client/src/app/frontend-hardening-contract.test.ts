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

test("z-index layering uses shared design tokens instead of hardcoded local layers", () => {
  const zIndexTokensSource = readClientSource("../styles/tokens/_z-index.css");
  const animationsSource = readClientSource("../styles/tokens/_animations.css");
  const resizableSource = readClientSource("../components/ui/resizable.tsx");
  const navigationMenuSource = readClientSource("../components/ui/navigation-menu.tsx");
  const inputOtpSource = readClientSource("../components/ui/input-otp.tsx");
  const calendarSource = readClientSource("../components/ui/calendar.tsx");

  assert.match(zIndexTokensSource, /--z-raised: 10;/);
  assert.match(zIndexTokensSource, /--z-floating: var\(--z-floating-ai-overlay\);/);
  assert.match(zIndexTokensSource, /--z-modal: var\(--z-modal-content\);/);
  assert.match(animationsSource, /z-index: var\(--z-below\);/);
  assert.match(animationsSource, /z-index: var\(--z-base\);/);
  assert.match(animationsSource, /z-index: var\(--z-inline\);/);
  assert.match(resizableSource, /z-\[var\(--z-raised\)\]/);
  assert.match(navigationMenuSource, /z-\[var\(--z-raised\)\]/);
  assert.match(inputOtpSource, /z-\[var\(--z-raised\)\]/);
  assert.match(calendarSource, /focus-within:z-\[var\(--z-sticky-content\)\]/);
});

test("decorative clipped surfaces use overflow clip with hidden fallback", () => {
  const loginCssSource = readClientSource("../pages/Login.css");
  const dailyCssSource = readClientSource("../pages/collection/CollectionDailyPage.css");
  const monthlyCssSource = readClientSource("../pages/collection-summary/CollectionMonthlyComparisonPanel.css");

  assert.match(loginCssSource, /\.login-card \{[\s\S]*overflow: hidden;[\s\S]*overflow: clip;/);
  assert.match(dailyCssSource, /\.collection-daily-role-guide \{[\s\S]*overflow: hidden;[\s\S]*overflow: clip;/);
  assert.match(dailyCssSource, /\.collection-daily-filters-card,\s*\.collection-daily-calendar-card \{[\s\S]*overflow: hidden;[\s\S]*overflow: clip;/);
  assert.match(dailyCssSource, /\.collection-daily-mobile-day-card,\s*\.collection-daily-desktop-day \{[\s\S]*overflow: hidden;[\s\S]*overflow: clip;/);
  assert.match(monthlyCssSource, /\.collection-monthly-comparison-filter-card \{[\s\S]*overflow: clip;/);
  assert.match(monthlyCssSource, /\.collection-monthly-comparison-section-card \{[\s\S]*overflow: clip;/);
});

test("route error boundary announces failures as an atomic alert", () => {
  const source = readClientSource("../app/AppRouteErrorBoundary.tsx");

  assert.match(source, /role="alert"/);
  assert.match(source, /aria-live="assertive"/);
  assert.match(source, /aria-atomic="true"/);
  assert.match(source, /aria-labelledby="app-route-error-boundary-title"/);
  assert.match(source, /aria-describedby="app-route-error-boundary-description"/);
});

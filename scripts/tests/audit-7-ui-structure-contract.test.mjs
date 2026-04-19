import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();

function readRepoFile(relativePath) {
  return readFileSync(path.resolve(repoRoot, relativePath), "utf8");
}

test("activity mobile list stays decomposed around memoized repeated row surfaces", () => {
  const listSource = readRepoFile("client/src/pages/activity/ActivityMobileLogsList.tsx");
  const cardSource = readRepoFile("client/src/pages/activity/ActivityMobileLogCard.tsx");
  const summarySource = readRepoFile("client/src/pages/activity/ActivityMobileSelectionSummary.tsx");

  assert.match(listSource, /ActivityMobileLogCard/);
  assert.match(listSource, /ActivityMobileSelectionSummary/);
  assert.match(cardSource, /export const ActivityMobileLogCard = memo\(function ActivityMobileLogCard/);
  assert.match(summarySource, /export const ActivityMobileSelectionSummary = memo\(function ActivityMobileSelectionSummary/);
});

test("collection save and receipt surfaces stay decomposed along reviewed boundaries", () => {
  const panelSource = readRepoFile("client/src/pages/collection/CollectionReceiptPanel.tsx");
  const savePageSource = readRepoFile("client/src/pages/collection/SaveCollectionPage.tsx");

  assert.match(panelSource, /CollectionReceiptExistingList/);
  assert.match(panelSource, /CollectionReceiptPendingGrid/);
  assert.match(savePageSource, /SaveCollectionActionBar/);
  assert.match(savePageSource, /SaveCollectionFormSection/);
  assert.match(savePageSource, /SaveCollectionPageHeaderContent/);
});

test("dashboard charts and section isolation stay split into support and boundary surfaces", () => {
  const chartsGridSource = readRepoFile("client/src/pages/dashboard/DashboardChartsGrid.tsx");
  const contentViewSource = readRepoFile("client/src/pages/dashboard/DashboardContentView.tsx");
  const deferredSource = readRepoFile("client/src/pages/dashboard/DashboardDeferredSections.tsx");

  assert.match(chartsGridSource, /DashboardTrendDaySelector/);
  assert.match(chartsGridSource, /DashboardChartLoadingState/);
  assert.match(chartsGridSource, /DashboardChartLegendPill/);
  assert.match(contentViewSource, /DashboardSectionBoundary/);
  assert.match(deferredSource, /DashboardSectionBoundary/);
});

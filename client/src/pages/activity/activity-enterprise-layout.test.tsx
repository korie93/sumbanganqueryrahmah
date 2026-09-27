import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ActivityQuickSnapshotSection } from "./ActivityQuickSnapshotSection";
import { ActivityPageHeader } from "./ActivityPageHeader";

test("Activity live snapshot retains all five labeled counts without nested cards", () => {
  const markup = renderToStaticMarkup(createElement(ActivityQuickSnapshotSection, {
    bannedCount: 5,
    summaryCounts: { onlineCount: 11, idleCount: 2, logoutCount: 3, kickedCount: 4 },
  }));
  assert.match(markup, /aria-label="Live activity snapshot"/);
  assert.match(markup, /<dl/);
  for (const [key, count] of [["online", 11], ["idle", 2], ["logout", 3], ["kicked", 4], ["banned", 5]]) {
    assert.match(markup, new RegExp(`data-testid="text-${key}-count">${count}</dd>`));
  }
  assert.doesNotMatch(markup, /glass-wrapper|shadow|rounded-full/);
});

test("Activity keeps filters and logs ahead of secondary retention without changing access gates", () => {
  const source = readFileSync(new URL("./ActivityPageContent.tsx", import.meta.url), "utf8");
  assert.ok(source.indexOf("<ActivityQuickSnapshotSection") < source.indexOf("<ActivityFiltersSection"));
  assert.ok(source.indexOf("<ActivityFiltersSection") < source.indexOf("<ActivityLogsSection"));
  assert.ok(source.indexOf("<ActivityLogsSection") < source.indexOf("<ActivityRetentionPanel"));
  assert.match(source, /canModerateActivity \? \(\s*<ActivityRetentionPanel onCleanupComplete=\{onRefreshActivity\}/);
  assert.match(source, /shouldDeferSecondaryMobileSections=\{shouldDeferSecondaryMobileSections\}/);
});

test("Activity header retains moderation gate, filter state and refresh disabled state", () => {
  const common = {
    activityCount: 11, canModerateActivity: false, filters: {}, isMobile: true,
    loading: true, onOpenBulkDeleteDialog: () => undefined, onRefresh: () => undefined,
    onToggleFilters: () => undefined, selectedCount: 2, showFilters: true,
  };
  const readonly = renderToStaticMarkup(createElement(ActivityPageHeader, common));
  assert.doesNotMatch(readonly, /button-bulk-delete-activity/);
  assert.match(readonly, /aria-expanded="true" aria-controls="activity-filters-panel"/);
  assert.match(readonly, /disabled=""[^>]*data-testid="button-refresh"/);
  const moderator = renderToStaticMarkup(createElement(ActivityPageHeader, { ...common, canModerateActivity: true }));
  assert.match(moderator, /Delete Selected \(2\)/);
});

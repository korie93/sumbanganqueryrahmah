import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CollectionDailyCalendarViewModeControl } from "./CollectionDailyCalendarViewModeControl";
import {
  COLLECTION_DAILY_CALENDAR_VIEW_MODE_OPTIONS,
  DEFAULT_COLLECTION_DAILY_CALENDAR_VIEW_MODE,
} from "./collection-daily-calendar-view-mode-utils";

test("calendar display uses one labelled native select and preserves every saved mode", () => {
  for (const selected of COLLECTION_DAILY_CALENDAR_VIEW_MODE_OPTIONS) {
    const markup = renderToStaticMarkup(createElement(CollectionDailyCalendarViewModeControl, {
      value: selected.id, onChange: () => undefined,
    }));
    assert.equal((markup.match(/<select\b/g) || []).length, 1);
    assert.match(markup, /aria-label="Choose calendar display mode"/);
    assert.match(markup, /aria-describedby="[^"]+-description"/);
    assert.equal((markup.match(/<option\b/g) || []).length, 7);
    assert.ok(markup.includes(`value="${selected.id}" selected=""`));
    for (const option of COLLECTION_DAILY_CALENDAR_VIEW_MODE_OPTIONS) assert.ok(markup.includes(option.label));
    assert.doesNotMatch(markup, /<button|aria-pressed/);
    assert.ok(markup.includes(selected.description));
  }
  assert.equal(DEFAULT_COLLECTION_DAILY_CALENDAR_VIEW_MODE, "content");
});

test("calendar administrative controls are disclosed while pending-change review remains visible", () => {
  const targets = readFileSync(new URL("./CollectionDailyTargetControlsSection.tsx", import.meta.url), "utf8");
  assert.match(targets, /<details[^>]*>[\s\S]*Target and calendar management[\s\S]*<CollectionDailyTargetControls/);
  assert.match(targets, /dirtyCalendarDaysCount > 0/);
  const calendar = readFileSync(new URL("./CollectionDailyCalendarCard.tsx", import.meta.url), "utf8");
  assert.match(calendar, /data-testid="collection-daily-status-tools"/);
  assert.ok(calendar.indexOf("<CollectionDailyCalendarQuickFilter") < calendar.indexOf("data-testid=\"collection-daily-status-tools\""));
  assert.ok(calendar.indexOf("<CollectionDailyCalendarViewModeControl") < calendar.indexOf("data-testid=\"collection-daily-status-tools\""));
  assert.ok(calendar.lastIndexOf("</details>", calendar.indexOf("<CollectionDailyCalendarConflictReport")) > calendar.indexOf("data-testid=\"collection-daily-status-tools\""));
  assert.ok(calendar.indexOf("<CollectionDailyCalendarAttentionSummary") < calendar.indexOf("data-testid=\"collection-daily-status-tools\""));
});

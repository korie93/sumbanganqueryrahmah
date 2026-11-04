import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CollectionDailyTargetControls, type CollectionDailyTargetControlsProps } from "../CollectionDailyTargetControls";

function controls(overrides: Partial<CollectionDailyTargetControlsProps> = {}) {
  return renderToStaticMarkup(createElement(CollectionDailyTargetControls, {
    monthlyTargetInput: "1000", onMonthlyTargetInputChange() {},
    canEditTarget: true, canEditCalendar: true, savingTarget: false, savingCalendar: false,
    onSaveTarget() {}, onSaveCalendar() {}, calendarDays: [], dirtyCalendarDaysCount: 0,
    ...overrides,
  }));
}

function button(markup: string, label: string) {
  const found = [...markup.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].find(([html]) => html.includes(label));
  assert.ok(found, `${label} exists`);
  return found[0];
}

test("dirty calendar blocks Save Target and explains how to save or explicitly discard it", () => {
  const html = controls({ dirtyCalendarDaysCount: 1 });
  assert.match(button(html, "Save Target"), /disabled=""/);
  assert.match(button(html, "Save Target"), /aria-describedby="collection-daily-calendar-save-help"/);
  assert.match(html, /Refresh dan sahkan pembatalan/);
  assert.doesNotMatch(button(controls(), "Save Target"), /disabled=""/);
});

test("both save actions and target input are disabled for either pending save or overview refresh", () => {
  for (const busy of [{ savingTarget: true }, { savingCalendar: true }, { loadingOverview: true }]) {
    const html = controls(busy);
    assert.match(button(html, "Save Target"), /disabled=""/);
    assert.match(button(html, "Save Changed Days"), /disabled=""/);
    assert.match(html, /<input\b[^>]*disabled=""/);
  }
});

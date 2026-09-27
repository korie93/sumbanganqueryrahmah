import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CollectionDailyPeriodFields } from "../CollectionDailyPeriodFields";
import { CollectionDailyTargetControls } from "../CollectionDailyTargetControls";

test("daily period fields retain labels, bounds and values in the compact mobile grid", () => {
  const markup = renderToStaticMarkup(createElement(CollectionDailyPeriodFields, {
    yearInput: "2026", monthInput: "8", minYear: 2020, maxYear: 2030, isMobile: true,
    containerClassName: "grid grid-cols-2 gap-3", onYearInputChange: () => undefined,
    onMonthInputChange: () => undefined, onYearCommit: () => 2026, onMonthCommit: () => 8,
  }));
  assert.match(markup, /grid-cols-2/);
  assert.match(markup, /for="collection-daily-year-input"/);
  assert.match(markup, /for="collection-daily-month-input"/);
  assert.match(markup, /min="2020" max="2030"/);
  assert.match(markup, /min="1" max="12"/);
  assert.match(markup, /value="2026"/);
  assert.match(markup, /value="8"/);
  assert.match(markup, /h-11 rounded-md/);
});

test("compact daily target actions keep target and dirty-calendar security gates", () => {
  const props = {
    monthlyTargetInput: "10000.00", onMonthlyTargetInputChange: () => undefined,
    canEditTarget: false, canEditCalendar: false, savingTarget: false, onSaveTarget: () => undefined,
    savingCalendar: false, onSaveCalendar: () => undefined, calendarDays: [], dirtyCalendarDaysCount: 0,
  };
  const denied = renderToStaticMarkup(createElement(CollectionDailyTargetControls, props));
  assert.equal((denied.match(/<button[^>]*disabled=""/g) || []).length, 2);
  assert.match(denied, /id="collection-daily-monthly-target"[^>]*disabled=""/);
  assert.match(denied, /Select exactly one staff nickname/);
  assert.match(denied, /Superuser mesti pilih tepat satu staff nickname/);
  const allowedTarget = renderToStaticMarkup(createElement(CollectionDailyTargetControls, {
    ...props, canEditTarget: true, canEditCalendar: true,
  }));
  assert.equal((allowedTarget.match(/<button[^>]*disabled=""/g) || []).length, 1);
  assert.match(allowedTarget, /Butang save akan aktif selepas ada perubahan/);
  assert.match(allowedTarget, /aria-live="polite" aria-atomic="true"/);
  assert.match(allowedTarget, /data-floating-ai-avoid="true"/);
  assert.doesNotMatch(allowedTarget, /rounded-2xl|shadow-sm/);
});

test("daily mobile filters remove repeated chrome without hiding scope or changing commit handlers", () => {
  const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const mobile = read("CollectionDailyMobileFiltersLayout.tsx");
  assert.match(mobile, /grid grid-cols-2 gap-3/);
  assert.match(mobile, /<CollectionDailyStaffScopeField \{\.\.\.props\} isMobile/);
  assert.match(mobile, /props.canManage \? \([\s\S]*<CollectionDailyTargetControlsSection/);
  assert.doesNotMatch(mobile, /<Badge|shadow-sm|rounded-2xl/);
  const fields = read("CollectionDailyPeriodFields.tsx");
  assert.match(fields, /onBlur=\{onYearCommit\}/);
  assert.match(fields, /onBlur=\{onMonthCommit\}/);
  assert.match(fields, /event.key === "Enter"[\s\S]*onYearCommit\(\)/);
  assert.match(fields, /event.key === "Enter"[\s\S]*onMonthCommit\(\)/);
});

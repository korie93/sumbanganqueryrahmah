import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CollectionDailyPeriodFields } from "@/pages/collection/CollectionDailyPeriodFields";
import {
  getCollectionDailyMalaysiaPeriod,
  getCollectionDailyTodayDate,
  shiftCollectionDailyPeriod,
} from "@/pages/collection/useCollectionDailyPeriod";

test("Daily today and initial period use Malaysia midnight regardless of the client timezone", () => {
  const beforeMidnight = new Date("2026-10-31T15:59:59.999Z");
  const afterMidnight = new Date("2026-10-31T16:00:00.000Z");
  assert.equal(getCollectionDailyTodayDate(beforeMidnight), "2026-10-31");
  assert.equal(getCollectionDailyTodayDate(afterMidnight), "2026-11-01");
  assert.deepEqual(getCollectionDailyMalaysiaPeriod(beforeMidnight), { year: 2026, month: 10 });
  assert.deepEqual(getCollectionDailyMalaysiaPeriod(afterMidnight), { year: 2026, month: 11 });
  assert.equal(getCollectionDailyTodayDate(new Date("2025-12-31T16:00:00Z")), "2026-01-01");
});

test("Daily month navigation changes year and month together across year boundaries", () => {
  assert.deepEqual(shiftCollectionDailyPeriod({ year: 2026, month: 1 }, -1), { year: 2025, month: 12 });
  assert.deepEqual(shiftCollectionDailyPeriod({ year: 2026, month: 12 }, 1), { year: 2027, month: 1 });
  assert.deepEqual(shiftCollectionDailyPeriod({ year: 2026, month: 3 }, -1), { year: 2026, month: 2 });
});

test("Daily month navigation never crosses the supported 2000–2100 year range", () => {
  assert.deepEqual(shiftCollectionDailyPeriod({ year: 2000, month: 1 }, -1), { year: 2000, month: 1 });
  assert.deepEqual(shiftCollectionDailyPeriod({ year: 2100, month: 12 }, 1), { year: 2100, month: 12 });
  assert.deepEqual(shiftCollectionDailyPeriod({ year: 2000, month: 1 }, 1), { year: 2000, month: 2 });
  assert.deepEqual(shiftCollectionDailyPeriod({ year: 2100, month: 12 }, -1), { year: 2100, month: 11 });
});

function renderPeriod(overrides: Partial<Parameters<typeof CollectionDailyPeriodFields>[0]> = {}) {
  return renderToStaticMarkup(createElement(CollectionDailyPeriodFields, {
    yearInput: "2026", monthInput: "10", minYear: 2000, maxYear: 2100,
    onYearInputChange() {}, onMonthInputChange() {},
    onYearCommit: () => 2026, onMonthCommit: () => 10,
    onPreviousMonth() {}, onNextMonth() {}, onCurrentMonth() {},
    isMobile: false, ...overrides,
  }));
}

test("Daily month shortcuts have distinct accessible names and expose current month availability", () => {
  const markup = renderPeriod({ isCurrentMonth: true });
  assert.match(markup, /aria-label="Navigasi bulan Collection Daily"/);
  assert.match(markup, /aria-label="Bulan sebelumnya"/);
  assert.match(markup, /aria-label="Bulan seterusnya"/);
  assert.match(markup, /aria-label="Bulan ini"[^>]*disabled=""/);
  assert.equal((markup.match(/<button/g) ?? []).length, 3);
});

test("Daily dirty/loading lock disables numeric fields and all month shortcuts with a shared explanation", () => {
  const markup = renderPeriod({
    isMobile: true,
    periodNavigationDisabled: true,
    periodNavigationDisabledReason: "Simpan perubahan kalendar sebelum menukar bulan.",
  });
  assert.equal((markup.match(/disabled=""/g) ?? []).length, 5);
  assert.equal((markup.match(/aria-describedby="collection-daily-period-help"/g) ?? []).length, 5);
  assert.match(markup, /id="collection-daily-period-help"[^>]*role="status"/);
  assert.match(markup, /Simpan perubahan kalendar sebelum menukar bulan/);
});

test("Daily year boundary availability disables only the unavailable shortcut", () => {
  const first = renderPeriod({ yearInput: "2000", monthInput: "1", canPreviousMonth: false });
  assert.match(first, /aria-label="Bulan sebelumnya"[^>]*disabled=""/);
  assert.doesNotMatch(first, /aria-label="Bulan seterusnya"[^>]*disabled=""/);
  const last = renderPeriod({ yearInput: "2100", monthInput: "12", canNextMonth: false });
  assert.match(last, /aria-label="Bulan seterusnya"[^>]*disabled=""/);
  assert.doesNotMatch(last, /aria-label="Bulan sebelumnya"[^>]*disabled=""/);
});

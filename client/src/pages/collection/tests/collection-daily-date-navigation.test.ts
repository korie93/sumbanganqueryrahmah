import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getCollectionDailyAdjacentDates } from "../collection-daily-date-navigation";
import { CollectionDailyDateNavigation } from "../CollectionDailyDateNavigation";

const days = ["2026-10-03", "2026-10-01", "2026-10-02", "2026-10-02", "2026-11-01"]
  .map((date) => ({ date }));

test("date navigation sorts and deduplicates loaded dates without crossing the month", () => {
  assert.deepEqual(getCollectionDailyAdjacentDates(days, "2026-10-02"), {
    previousDate: "2026-10-01", nextDate: "2026-10-03",
  });
  assert.deepEqual(getCollectionDailyAdjacentDates(days, "2026-10-01"), {
    previousDate: null, nextDate: "2026-10-02",
  });
  assert.deepEqual(getCollectionDailyAdjacentDates(days, "2026-10-03"), {
    previousDate: "2026-10-02", nextDate: null,
  });
});

test("date navigation does not guess dates for an absent or unselected day", () => {
  for (const date of [null, "", "invalid", "2026-10-14"]) {
    assert.deepEqual(getCollectionDailyAdjacentDates(days, date), { previousDate: null, nextDate: null });
  }
});

test("date navigation handles leap day and year end without crossing period scope", () => {
  assert.deepEqual(getCollectionDailyAdjacentDates(
    [{ date: "2028-02-28" }, { date: "2028-02-29" }, { date: "2028-03-01" }], "2028-02-29",
  ), { previousDate: "2028-02-28", nextDate: null });
  assert.deepEqual(getCollectionDailyAdjacentDates(
    [{ date: "2026-12-31" }, { date: "2027-01-01" }], "2026-12-31",
  ), { previousDate: null, nextDate: null });
});

test("popup date controls are distinguished from record pagination and use 44px targets", () => {
  const markup = renderToStaticMarkup(createElement(CollectionDailyDateNavigation, {
    previousDate: null, nextDate: "2026-10-02", loading: false, onChangeDate: () => {},
  }));
  assert.match(markup, /aria-label="Tukar tarikh kutipan dalam bulan ini"/);
  assert.match(markup, /aria-label="Tarikh sebelumnya"[^>]*disabled/);
  assert.match(markup, /<button(?=[^>]*title="02\/10\/2026")(?=[^>]*aria-label="Tarikh seterusnya")[^>]*>/);
  assert.equal((markup.match(/h-11 w-11/g) || []).length, 2);
  assert.equal((markup.match(/aria-hidden="true"/g) || []).length, 2);
});

test("both date controls are disabled during loading", () => {
  const markup = renderToStaticMarkup(createElement(CollectionDailyDateNavigation, {
    previousDate: "2026-10-01", nextDate: "2026-10-03", loading: true, onChangeDate: () => {},
  }));
  assert.equal((markup.match(/disabled=""/g) || []).length, 2);
});

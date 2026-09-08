import assert from "node:assert/strict";
import test from "node:test";
import { buildCollectionOspDailyMovements } from "../collection-osp-daily-movement";

const agings = ["D3", "D4", "D5", "D6"] as const;
const dates = ["2026-08-27", "2026-09-08", "2026-09-09"];
const targets = agings.map((aging, index) => ({ aging, targetOsp: ["30000.00", "15000.00", "10000.00", "5000.00"][index]! }));

test("daily D3 acceptance is 300 / 30000 = 1%, not the TT OSP cumulative formula", () => {
  const day = buildCollectionOspDailyMovements({ dates, targets, movements: [{ date: dates[1]!, aging: "D3", ospClosed: "300.00", accountCount: 1 }] }).get(dates[1]!)!;
  assert.equal(day.rows[0]?.resultPercentage, "1.0000");
  assert.equal(day.rows[0]?.ospClosed, "300.00");
  assert.equal(day.all.resultPercentage, "0.5000");
});

test("four daily agings produce monetary-weighted TOTAL without averaging rounded percentages", () => {
  const day = buildCollectionOspDailyMovements({ dates, targets, movements: agings.map((aging, index) => ({
    date: dates[1]!, aging, ospClosed: ["300.00", "300.00", "300.00", "200.00"][index]!, accountCount: index + 1,
  })) }).get(dates[1]!)!;
  assert.deepEqual(day.rows.map((row) => row.resultPercentage), ["1.0000", "2.0000", "3.0000", "4.0000"]);
  assert.deepEqual(day.all, { aging: "ALL", targetOsp: "60000.00", ospClosed: "1100.00", resultPercentage: "1.8333", closedAccountCount: 10 });
  assert.notEqual(day.all.resultPercentage, "2.5000");
});

test("every requested valid date includes quiet zero activity and only its effective date movement", () => {
  const result = buildCollectionOspDailyMovements({ dates, targets, movements: [
    { date: "2026-08-27", aging: "D3", ospClosed: "300.00", accountCount: 1 },
    { date: "2026-08-26", aging: "D3", ospClosed: "900.00", accountCount: 1 },
  ] });
  assert.deepEqual([...result.keys()], dates);
  assert.equal(result.get("2026-08-27")?.all.ospClosed, "300.00");
  for (const date of dates.slice(1)) {
    assert.equal(result.get(date)?.all.ospClosed, "0.00");
    assert.equal(result.get(date)?.all.resultPercentage, "0.0000");
    assert.equal(result.get(date)?.rows.length, 4);
  }
});

test("zero targets follow existing 0% semantics without hiding legitimate closed amounts", () => {
  const day = buildCollectionOspDailyMovements({ dates, targets: agings.map((aging) => ({ aging, targetOsp: "0.00" })),
    movements: [{ date: dates[1]!, aging: "D3", ospClosed: "300.00", accountCount: 1 }] }).get(dates[1]!)!;
  assert.equal(day.rows[0]?.resultPercentage, "0.0000");
  assert.equal(day.all.resultPercentage, "0.0000");
  assert.equal(day.all.ospClosed, "300.00");
});

test("daily money accumulation stays exact beyond the JavaScript safe-integer limit", () => {
  const day = buildCollectionOspDailyMovements({ dates, targets, movements: [
    { date: dates[1]!, aging: "D3", ospClosed: "90071992547409.91", accountCount: 1 },
    { date: dates[1]!, aging: "D3", ospClosed: "0.01", accountCount: 1 },
    { date: dates[1]!, aging: "D4", ospClosed: "0.01", accountCount: 1 },
  ] }).get(dates[1]!)!;
  assert.equal(day.rows[0]?.ospClosed, "90071992547409.92");
  assert.equal(day.all.ospClosed, "90071992547409.93");
});

test("fractional percentages use unrounded monetary totals when all aging targets differ", () => {
  const day = buildCollectionOspDailyMovements({ dates,
    targets: agings.map((aging, index) => ({ aging, targetOsp: ["0.03", "0.07", "0.11", "0.13"][index]! })),
    movements: agings.map((aging) => ({ date: dates[1]!, aging, ospClosed: "0.01", accountCount: 1 })),
  }).get(dates[1]!)!;
  assert.deepEqual(day.rows.map((row) => row.resultPercentage), ["33.3333", "14.2857", "9.0909", "7.6923"]);
  assert.deepEqual(day.all, { aging: "ALL", targetOsp: "0.34", ospClosed: "0.04", resultPercentage: "11.7647", closedAccountCount: 4 });
});

test("a legitimate zero-OSP closure retains its account count without carrying movement to another day", () => {
  const movements = buildCollectionOspDailyMovements({ dates, targets, movements: [
    { date: dates[0]!, aging: "D6", ospClosed: "0.00", accountCount: 1 },
    { date: dates[1]!, aging: "D3", ospClosed: "100.01", accountCount: 1 },
    { date: dates[1]!, aging: "D3", ospClosed: "199.99", accountCount: 2 },
  ] });
  assert.deepEqual(movements.get(dates[0]!)!.rows[3], {
    aging: "D6", targetOsp: "5000.00", ospClosed: "0.00", resultPercentage: "0.0000", closedAccountCount: 1,
  });
  assert.equal(movements.get(dates[0]!)!.all.closedAccountCount, 1);
  assert.equal(movements.get(dates[1]!)!.rows[0]!.ospClosed, "300.00");
  assert.equal(movements.get(dates[1]!)!.all.closedAccountCount, 3);
  assert.equal(movements.get(dates[2]!)!.all.closedAccountCount, 0);
  assert.equal(movements.get(dates[2]!)!.all.ospClosed, "0.00");
});

test("missing target configuration is not silently interpreted as zero", () => {
  assert.throws(() => buildCollectionOspDailyMovements({ dates, targets: targets.slice(0, 3), movements: [] }), /complete shared/);
});

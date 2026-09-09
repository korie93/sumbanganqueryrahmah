import assert from "node:assert/strict";
import test from "node:test";
import { buildCollectionOspDailyMovements } from "../collection-osp-daily-movement";
import { formatCollectionOspMoneyCents, formatCollectionOspPercentage, parseCollectionOspMoneyCents } from "../collection-osp-reconciliation";

const agings = ["D3", "D4", "D5", "D6"] as const;
const dates = ["2026-08-27", "2026-09-08", "2026-09-09"];
const targets = agings.map((aging, index) => ({ aging,
  totalOsp: ["100000.00", "50000.00", "40000.00", "10000.00"][index]!,
  targetOsp: ["30000.00", "15000.00", "10000.00", "5000.00"][index]!,
}));

test("daily result uses TT OSP: closed 10000 / TT 1000000 = 1%, never Target OSP 300000", () => {
  const day = buildCollectionOspDailyMovements({ dates,
    targets: targets.map((row) => row.aging === "D3" ? { ...row, totalOsp: "1000000.00", targetOsp: "300000.00" } : row),
    movements: [{ date: dates[1]!, aging: "D3", ospClosed: "10000.00", accountCount: 1 }],
  }).get(dates[1]!)!;
  assert.equal(day.rows[0]?.resultPercentage, "1.0000");
  assert.equal(day.rows[0]?.ospClosed, "10000.00");
  assert.equal(day.rows[0]?.totalOsp, "1000000.00");
  assert.equal(day.rows[0]?.targetOsp, "300000.00");
  assert.equal(day.rows[0]?.ospRequiredForOnePercent, "10000.0000");
  assert.notEqual(day.rows[0]?.resultPercentage, "3.3333");
});

test("four daily agings produce monetary-weighted TOTAL without averaging rounded percentages", () => {
  const day = buildCollectionOspDailyMovements({ dates, targets, movements: agings.map((aging, index) => ({
    date: dates[1]!, aging, ospClosed: ["1000.00", "1000.00", "1200.00", "400.00"][index]!, accountCount: index + 1,
  })) }).get(dates[1]!)!;
  assert.deepEqual(day.rows.map((row) => row.resultPercentage), ["1.0000", "2.0000", "3.0000", "4.0000"]);
  assert.deepEqual(day.all, { aging: "ALL", totalOsp: "200000.00", targetOsp: "60000.00", ospRequiredForOnePercent: "2000.0000",
    ospClosed: "3600.00", resultPercentage: "1.8000", closedAccountCount: 10 });
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

test("zero TT OSP follows existing 0% semantics without hiding legitimate closed amounts", () => {
  const day = buildCollectionOspDailyMovements({ dates, targets: targets.map((row) => ({ ...row, totalOsp: "0.00" })),
    movements: [{ date: dates[1]!, aging: "D3", ospClosed: "300.00", accountCount: 1 }] }).get(dates[1]!)!;
  assert.equal(day.rows[0]?.resultPercentage, "0.0000");
  assert.equal(day.all.resultPercentage, "0.0000");
  assert.equal(day.all.ospRequiredForOnePercent, "0.0000");
  assert.equal(day.all.ospClosed, "300.00");
});

test("daily money and denominator accumulation stays exact beyond the JavaScript safe-integer limit", () => {
  const day = buildCollectionOspDailyMovements({ dates,
    targets: targets.map((row) => ({ ...row, totalOsp: "90071992547409.91" })), movements: [
    { date: dates[1]!, aging: "D3", ospClosed: "90071992547409.91", accountCount: 1 },
    { date: dates[1]!, aging: "D3", ospClosed: "0.01", accountCount: 1 },
    { date: dates[1]!, aging: "D4", ospClosed: "0.01", accountCount: 1 },
  ] }).get(dates[1]!)!;
  assert.equal(day.rows[0]?.ospClosed, "90071992547409.92");
  assert.equal(day.rows[0]?.ospRequiredForOnePercent, "900719925474.0991");
  assert.equal(day.all.ospClosed, "90071992547409.93");
  assert.equal(day.all.totalOsp, "360287970189639.64");
  assert.equal(day.all.resultPercentage, "25.0000");
});

test("fractional percentages use exact TT OSP, not rounded OSP for one percent", () => {
  const day = buildCollectionOspDailyMovements({ dates,
    targets: targets.map((row, index) => ({ ...row, totalOsp: ["0.03", "0.07", "0.11", "0.13"][index]! })),
    movements: agings.map((aging) => ({ date: dates[1]!, aging, ospClosed: "0.01", accountCount: 1 })),
  }).get(dates[1]!)!;
  assert.deepEqual(day.rows.map((row) => row.resultPercentage), ["33.3333", "14.2857", "9.0909", "7.6923"]);
  assert.deepEqual(day.all, { aging: "ALL", totalOsp: "0.34", targetOsp: "60000.00", ospRequiredForOnePercent: "0.0034",
    ospClosed: "0.04", resultPercentage: "11.7647", closedAccountCount: 4 });
});

test("a legitimate zero-OSP closure retains its account count without carrying movement to another day", () => {
  const movements = buildCollectionOspDailyMovements({ dates, targets, movements: [
    { date: dates[0]!, aging: "D6", ospClosed: "0.00", accountCount: 1 },
    { date: dates[1]!, aging: "D3", ospClosed: "100.01", accountCount: 1 },
    { date: dates[1]!, aging: "D3", ospClosed: "199.99", accountCount: 2 },
  ] });
  assert.deepEqual(movements.get(dates[0]!)!.rows[3], {
    aging: "D6", totalOsp: "10000.00", targetOsp: "5000.00", ospRequiredForOnePercent: "100.0000",
    ospClosed: "0.00", resultPercentage: "0.0000", closedAccountCount: 1,
  });
  assert.equal(movements.get(dates[0]!)!.all.closedAccountCount, 1);
  assert.equal(movements.get(dates[1]!)!.rows[0]!.ospClosed, "300.00");
  assert.equal(movements.get(dates[1]!)!.all.closedAccountCount, 3);
  assert.equal(movements.get(dates[2]!)!.all.closedAccountCount, 0);
  assert.equal(movements.get(dates[2]!)!.all.ospClosed, "0.00");
});

test("missing or duplicate baseline configuration is not silently interpreted as a valid TT OSP", () => {
  assert.throws(() => buildCollectionOspDailyMovements({ dates, targets: targets.slice(0, 3), movements: [] }), /complete shared/);
  assert.throws(() => buildCollectionOspDailyMovements({ dates, targets: [...targets, targets[0]!], movements: [] }), /complete shared/);
  assert.throws(() => buildCollectionOspDailyMovements({ dates,
    targets: targets.map((row, index) => index === 0 ? { ...row, totalOsp: "" } : row), movements: [] }), /exact non-negative decimal/);
});

const acceptanceTargets = agings.map((aging, index) => ({ aging,
  totalOsp: ["1908183.36", "1219740.60", "1392703.35", "1234657.25"][index]!,
  targetOsp: ["572455.01", "365922.18", "417811.01", "370397.18"][index]!,
}));
const acceptanceCases = [
  { aging: "D3", closedExact: "19081.8336", closedSen: "19081.83", expected: "1.0000" },
  { aging: "D3", closedExact: "9540.9168", closedSen: "9540.92", expected: "0.5000" },
  { aging: "D3", closedExact: "38163.6672", closedSen: "38163.67", expected: "2.0000" },
  { aging: "D3", closedExact: "95409.1680", closedSen: "95409.17", expected: "5.0000" },
  { aging: "D3", closedExact: "190818.3360", closedSen: "190818.34", expected: "10.0000" },
  { aging: "D4", closedExact: "12197.4060", closedSen: "12197.41", expected: "1.0000" },
  { aging: "D5", closedExact: "13927.0335", closedSen: "13927.03", expected: "1.0000" },
  { aging: "D6", closedExact: "12346.5725", closedSen: "12346.57", expected: "1.0000" },
  { aging: "ALL", closedExact: "57552.8456", closedSen: "57552.85", expected: "1.0000" },
] as const;

for (const fixture of acceptanceCases) {
  test(`${fixture.aging} acceptance: exact and stored-sen OSP movement display ${Number(fixture.expected).toFixed(2)}%`, () => {
    const totalOsp = fixture.aging === "ALL" ? "5755284.56" : acceptanceTargets.find((row) => row.aging === fixture.aging)!.totalOsp;
    // Ratio arithmetic is scale-invariant. Prove the supplied mathematical
    // sub-sen fixture using a shared 1/10000 RM scale without relaxing the
    // production NUMERIC(16,2) money boundary or rounding the TT denominator.
    const exactClosedUnits = BigInt(fixture.closedExact.replace(".", ""));
    const exactBaselineUnits = parseCollectionOspMoneyCents(totalOsp) * 100n;
    assert.equal(formatCollectionOspPercentage(exactClosedUnits, exactBaselineUnits), fixture.expected);
    const day = buildCollectionOspDailyMovements({ dates, targets: acceptanceTargets,
      movements: [{ date: dates[0]!, aging: fixture.aging === "ALL" ? "D3" : fixture.aging,
        ospClosed: fixture.closedSen, accountCount: 1 }],
    }).get(dates[0]!)!;
    const row = fixture.aging === "ALL" ? day.all : day.rows.find((item) => item.aging === fixture.aging)!;
    assert.equal(row.resultPercentage, fixture.expected);
    assert.equal(Number(row.resultPercentage).toFixed(2), Number(fixture.expected).toFixed(2));
    assert.equal(row.totalOsp, totalOsp);
  });
}

test("OSP for one percentage point retains exact four-decimal TT-derived values before display rounding", () => {
  const day = buildCollectionOspDailyMovements({ dates, targets: acceptanceTargets, movements: [] }).get(dates[0]!)!;
  const rows = [...day.rows, day.all];
  assert.deepEqual(rows.map((row) => row.ospRequiredForOnePercent), ["19081.8336", "12197.4060", "13927.0335", "12346.5725", "57552.8456"]);
  const roundedDisplay = rows.map((row) => formatCollectionOspMoneyCents((BigInt(row.ospRequiredForOnePercent.replace(".", "")) + 50n) / 100n));
  assert.deepEqual(roundedDisplay, ["19081.83", "12197.41", "13927.03", "12346.57", "57552.85"]);
  assert.equal(day.all.totalOsp, "5755284.56");
});

test("changing Target OSP does not alter daily movement or its TT OSP basis", () => {
  const movements = [{ date: dates[1]!, aging: "D3" as const, ospClosed: "1000.00", accountCount: 1 }];
  const first = buildCollectionOspDailyMovements({ dates, targets, movements }).get(dates[1]!)!;
  const changed = buildCollectionOspDailyMovements({ dates, targets: targets.map((row) => ({ ...row, targetOsp: "0.00" })), movements }).get(dates[1]!)!;
  assert.deepEqual([...changed.rows, changed.all].map(({ targetOsp: _targetOsp, ...row }) => row),
    [...first.rows, first.all].map(({ targetOsp: _targetOsp, ...row }) => row));
});

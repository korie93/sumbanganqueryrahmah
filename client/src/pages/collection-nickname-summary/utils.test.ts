import assert from "node:assert/strict";
import test from "node:test";
import { normalizeNicknameTotals } from "@/pages/collection-nickname-summary/utils";

test("normalizeNicknameTotals preserves optional backend target benchmark", () => {
  const rows = normalizeNicknameTotals([
    {
      nickname: " Collector Alpha ",
      totalRecords: "4",
      totalAmount: "1200.50",
      targetBenchmark: {
        amount: "2000.75",
        configuredMonths: "1",
        latestUpdatedAt: "2026-06-20T01:02:03.000Z",
        latestUpdatedBy: " superuser ",
        missingMonths: "0",
        months: [{
          amount: "2000.75",
          configured: true,
          month: "2026-06",
          updatedAt: "2026-06-20T01:02:03.000Z",
          updatedBy: "superuser",
        }],
        requestedMonths: "1",
      },
    },
    {
      nickname: "Collector Beta",
      totalRecords: 1,
      totalAmount: 50,
      targetBenchmark: {
        amount: -100,
        configuredMonths: "bad",
        missingMonths: 1,
        requestedMonths: 1,
      },
    },
  ]);

  assert.deepEqual(rows, [
    {
      nickname: "Collector Alpha",
      totalRecords: 4,
      totalAmount: 1200.5,
      targetBenchmark: {
        amount: 2000.75,
        configuredMonths: 1,
        latestUpdatedAt: "2026-06-20T01:02:03.000Z",
        latestUpdatedBy: "superuser",
        missingMonths: 0,
        months: [{
          amount: 2000.75,
          configured: true,
          month: "2026-06",
          updatedAt: "2026-06-20T01:02:03.000Z",
          updatedBy: "superuser",
        }],
        requestedMonths: 1,
      },
    },
    {
      nickname: "Collector Beta",
      totalRecords: 1,
      totalAmount: 50,
      targetBenchmark: {
        amount: 0,
        configuredMonths: 0,
        latestUpdatedAt: null,
        latestUpdatedBy: null,
        missingMonths: 1,
        months: [],
        requestedMonths: 1,
      },
    },
  ]);
});

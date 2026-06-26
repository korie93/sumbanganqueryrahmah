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
        missingMonths: "0",
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
        missingMonths: 0,
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
        missingMonths: 1,
        requestedMonths: 1,
      },
    },
  ]);
});

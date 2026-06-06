import test from "node:test";
import assert from "node:assert/strict";

import {
  buildViewerWorksheetColumns,
  buildViewerWorksheetData,
} from "@/pages/viewer/excel-export-utils";

test("buildViewerWorksheetData preserves ic-like values as strings", () => {
  const rows = [
    {
      __rowId: 1,
      name: "Ali",
      ic: "010203040506",
      amount: 123,
    },
  ];

  const worksheetData = buildViewerWorksheetData(["name", "ic", "amount"], rows, ["ic"]);

  assert.deepEqual(worksheetData, [
    {
      name: "Ali",
      ic: "010203040506",
      amount: 123,
    },
  ]);
});

test("buildViewerWorksheetColumns caps wide columns cleanly", () => {
  const columns = buildViewerWorksheetColumns(
    ["notes"],
    [
      {
        __rowId: 1,
        notes: "x".repeat(80),
      },
    ],
  );

  assert.deepEqual(columns, [{ wch: 50 }]);
});

test("viewer worksheet helpers preserve zero and false values", () => {
  const rows = [
    {
      __rowId: 1,
      amount: 0,
      active: false,
    },
  ];

  assert.deepEqual(buildViewerWorksheetData(["amount", "active"], rows, []), [
    {
      amount: 0,
      active: "false",
    },
  ]);
  assert.deepEqual(buildViewerWorksheetColumns(["amount", "active"], rows), [
    { wch: 8 },
    { wch: 8 },
  ]);
});

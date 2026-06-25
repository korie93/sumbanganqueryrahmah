import assert from "node:assert/strict";
import test from "node:test";
import type { BrowserStorageLike } from "@/lib/browser-storage";
import {
  buildViewerHeadersSignature,
  moveViewerColumn,
  normalizeViewerColumnPreference,
  readViewerColumnPreference,
  writeViewerColumnPreference,
} from "@/pages/viewer/viewer-column-preferences";

function createStorageMock(): BrowserStorageLike {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

test("viewer column preferences persist per dataset and merge new headers", () => {
  const storage = createStorageMock();
  const preference = {
    order: ["Amount", "Name"],
    visible: ["Amount"],
  };

  assert.equal(writeViewerColumnPreference("dataset-a", preference, storage), true);
  assert.deepEqual(
    readViewerColumnPreference("dataset-a", ["Name", "Amount", "Status"], storage),
    {
      order: ["Amount", "Name", "Status"],
      visible: ["Amount"],
    },
  );
  assert.deepEqual(
    readViewerColumnPreference("dataset-b", ["Name", "Amount"], storage),
    {
      order: ["Name", "Amount"],
      visible: ["Name", "Amount"],
    },
  );
});

test("viewer column preferences reject unknown columns and retain one visible field", () => {
  assert.deepEqual(
    normalizeViewerColumnPreference(
      { order: ["Unknown", "Amount"], visible: ["Unknown"] },
      ["Name", "Amount"],
    ),
    {
      order: ["Amount", "Name"],
      visible: ["Amount"],
    },
  );
});

test("moveViewerColumn reorders immutably within bounds", () => {
  const order = ["Name", "Amount", "Status"];
  assert.deepEqual(moveViewerColumn(order, "Amount", -1), ["Amount", "Name", "Status"]);
  assert.equal(moveViewerColumn(order, "Name", -1), order);
});

test("viewer preference signatures stay compact and sensitive to column order", () => {
  const signature = buildViewerHeadersSignature(["Name", "Amount", "Status"]);
  assert.match(signature, /^3:\d+$/);
  assert.notEqual(signature, buildViewerHeadersSignature(["Amount", "Name", "Status"]));
});

test("viewer preference storage prunes old datasets", () => {
  const storage = createStorageMock();
  for (let index = 0; index < 13; index += 1) {
    writeViewerColumnPreference(
      `dataset-${index}`,
      { order: ["Name", "Amount"], visible: ["Amount"] },
      storage,
    );
  }

  assert.deepEqual(readViewerColumnPreference("dataset-0", ["Name", "Amount"], storage), {
    order: ["Name", "Amount"],
    visible: ["Name", "Amount"],
  });
  assert.deepEqual(readViewerColumnPreference("dataset-12", ["Name", "Amount"], storage), {
    order: ["Name", "Amount"],
    visible: ["Amount"],
  });
});

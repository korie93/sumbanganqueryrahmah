import assert from "node:assert/strict";
import test from "node:test";
import type { BrowserStorageLike } from "@/lib/browser-storage";
import {
  ACTIVITY_COLUMN_PREFERENCE_STORAGE_KEY,
  getActivityGridTemplateColumns,
  getActivityTableMinWidth,
  getDefaultActivityColumnPreferences,
  getVisibleActivityColumns,
  moveActivityColumn,
  readActivityColumnPreferences,
  toggleActivityColumn,
  writeActivityColumnPreferences,
} from "@/pages/activity/activity-column-preferences";

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

test("activity column preferences round-trip through bounded safe storage", () => {
  const storage = createStorageMock();
  const preferences = moveActivityColumn(
    toggleActivityColumn(getDefaultActivityColumnPreferences(), "browser"),
    "duration",
    -1,
  );

  assert.equal(writeActivityColumnPreferences(preferences, storage), true);
  assert.deepEqual(readActivityColumnPreferences(storage), preferences);
});

test("activity column preferences discard corrupt and unknown values", () => {
  const storage = createStorageMock();
  storage.setItem(ACTIVITY_COLUMN_PREFERENCE_STORAGE_KEY, "{bad-json");

  assert.deepEqual(readActivityColumnPreferences(storage), getDefaultActivityColumnPreferences());
  assert.equal(storage.getItem(ACTIVITY_COLUMN_PREFERENCE_STORAGE_KEY), null);

  storage.setItem(
    ACTIVITY_COLUMN_PREFERENCE_STORAGE_KEY,
    JSON.stringify({ order: ["unknown", "ip"], visible: ["unknown"] }),
  );
  const normalized = readActivityColumnPreferences(storage);
  assert.equal(normalized.order[0], "ip");
  assert.deepEqual(normalized.visible, ["ip"]);
});

test("activity column helpers keep one visible column and align layout tracks", () => {
  let preferences = getDefaultActivityColumnPreferences();
  for (const column of preferences.order.slice(1)) {
    preferences = toggleActivityColumn(preferences, column);
  }
  assert.deepEqual(getVisibleActivityColumns(preferences), ["user"]);
  assert.equal(toggleActivityColumn(preferences, "user"), preferences);

  const columns = ["user", "ip", "login"] as const;
  assert.equal(
    getActivityGridTemplateColumns([...columns], true),
    "3rem minmax(10rem, 1.25fr) 10rem 8.5rem minmax(10rem, auto)",
  );
  assert.equal(getActivityTableMinWidth([...columns], false), 560);
  assert.equal(getActivityTableMinWidth([...columns], true), 736);
});

import assert from "node:assert/strict";
import test from "node:test";
import type { BrowserStorageLike } from "@/lib/browser-storage";
import { DEFAULT_AUDIT_LOG_FILTERS } from "@/pages/audit-logs/audit-log-page-state-utils";
import {
  buildAuditLogSavedView,
  getBuiltInAuditLogSavedViews,
  readCustomAuditLogSavedViews,
  writeCustomAuditLogSavedViews,
} from "@/pages/audit-logs/audit-log-saved-views";

function createStorageMock(): BrowserStorageLike {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

test("getBuiltInAuditLogSavedViews exposes useful audit presets", () => {
  const views = getBuiltInAuditLogSavedViews();

  assert.equal(views.some((view) => view.id === "builtin-critical-today"), true);
  assert.equal(views.some((view) => view.filters.categoryFilter === "Backup"), true);
});

test("custom audit saved views round-trip through safe storage", () => {
  const storage = createStorageMock();
  const view = buildAuditLogSavedView(
    { ...DEFAULT_AUDIT_LOG_FILTERS, categoryFilter: "Security", searchText: "FAILED" },
    "Failed security",
    "test",
  );

  assert.equal(writeCustomAuditLogSavedViews([view], storage), true);
  assert.deepEqual(readCustomAuditLogSavedViews(storage), [view]);
});

test("custom audit saved views recover from corrupt storage", () => {
  const storage = createStorageMock();
  storage.setItem("sqr.auditLogs.savedViews.v1", "{bad-json");

  assert.deepEqual(readCustomAuditLogSavedViews(storage), []);
  assert.equal(storage.getItem("sqr.auditLogs.savedViews.v1"), null);
});


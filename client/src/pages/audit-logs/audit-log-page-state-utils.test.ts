import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAuditLogsRequestParams,
  hasActiveAuditLogFilters,
  normalizeAuditLogsPagination,
  resolveInitialAuditLogsLayoutState,
} from "@/pages/audit-logs/audit-log-page-state-utils";
import type { AuditLogFilters } from "@/pages/audit-logs/types";

const baseFilters: AuditLogFilters = {
  actionFilter: "all",
  dateFrom: "",
  datePreset: "all",
  dateTo: "",
  performedByFilter: "",
  searchText: "",
  targetUserFilter: "",
};

test("resolveInitialAuditLogsLayoutState keeps mobile cleanup tools collapsed by default", () => {
  assert.deepEqual(resolveInitialAuditLogsLayoutState(390), {
    filtersOpen: false,
    recordsOpen: true,
    cleanupOpen: false,
  });
  assert.deepEqual(resolveInitialAuditLogsLayoutState(1280), {
    filtersOpen: false,
    recordsOpen: true,
    cleanupOpen: true,
  });
});

test("normalizeAuditLogsPagination keeps fallback pagination safe", () => {
  assert.deepEqual(
    normalizeAuditLogsPagination(undefined, 2, 20, 7),
    {
      page: 2,
      pageSize: 20,
      total: 7,
      totalPages: 1,
    },
  );
  assert.deepEqual(
    normalizeAuditLogsPagination({ page: 0, pageSize: 0, total: -1, totalPages: 0 }, 2, 20, 7),
    {
      page: 2,
      pageSize: 20,
      total: 0,
      totalPages: 1,
    },
  );
});

test("hasActiveAuditLogFilters only turns on when a real audit filter is applied", () => {
  assert.equal(hasActiveAuditLogFilters(baseFilters), false);
  assert.equal(hasActiveAuditLogFilters({ ...baseFilters, searchText: "restore" }), true);
  assert.equal(hasActiveAuditLogFilters({ ...baseFilters, actionFilter: "RESTORE_BACKUP" }), true);
});

test("buildAuditLogsRequestParams normalizes all-active and custom date filters safely", () => {
  assert.deepEqual(
    buildAuditLogsRequestParams(baseFilters, 3, 50, ""),
    {
      page: 3,
      pageSize: 50,
      action: undefined,
      performedBy: undefined,
      targetUser: undefined,
      search: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      sortBy: "newest",
    },
  );

  const customFilters: AuditLogFilters = {
    ...baseFilters,
    actionFilter: "RESTORE_BACKUP",
    performedByFilter: " admin ",
    targetUserFilter: "operator",
    searchText: "error",
    datePreset: "custom",
    dateFrom: "2026-04-01",
    dateTo: "2026-04-03",
  };

  const result = buildAuditLogsRequestParams(customFilters, 1, 20, "error");
  assert.equal(result.action, "RESTORE_BACKUP");
  assert.equal(result.performedBy, "admin");
  assert.equal(result.targetUser, "operator");
  assert.equal(result.search, "error");
  assert.equal(result.dateFrom, new Date("2026-04-01").toISOString());
  assert.equal(result.dateTo, new Date("2026-04-03T23:59:59").toISOString());
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  getPendingResetEmptyState,
  getPendingResetEmptyMessage,
  normalizePendingResetStatusFilter,
} from "@/pages/settings/account-management/pending-reset-utils";

test("normalizePendingResetStatusFilter keeps supported values", () => {
  assert.equal(normalizePendingResetStatusFilter("locked"), "locked");
  assert.equal(normalizePendingResetStatusFilter("pending_activation"), "pending_activation");
});

test("normalizePendingResetStatusFilter falls back to all", () => {
  assert.equal(normalizePendingResetStatusFilter("archived"), "all");
});

test("getPendingResetEmptyMessage returns loading copy", () => {
  assert.equal(
    getPendingResetEmptyMessage({
      hasActiveFilters: false,
      loading: true,
      total: 0,
    }),
    "Loading reset requests...",
  );
});

test("getPendingResetEmptyMessage returns default empty copy", () => {
  assert.equal(
    getPendingResetEmptyMessage({
      hasActiveFilters: false,
      loading: false,
      total: 0,
    }),
    "No pending reset requests.",
  );
});

test("getPendingResetEmptyMessage returns filtered empty copy", () => {
  assert.equal(
    getPendingResetEmptyMessage({
      hasActiveFilters: true,
      loading: false,
      total: 0,
    }),
    "No reset requests match the current filters.",
  );
});

test("getPendingResetEmptyState gives actionable filtered-empty guidance", () => {
  assert.deepEqual(
    getPendingResetEmptyState({
      hasActiveFilters: true,
      loading: false,
      total: 3,
    }),
    {
      title: "No reset requests match the current filters.",
      description: "Clear the active filters or adjust the search term to review more reset requests.",
      actionLabel: "Clear filters",
    },
  );
});

test("getPendingResetEmptyState omits actions for loading and default-empty states", () => {
  assert.equal(
    getPendingResetEmptyState({
      hasActiveFilters: false,
      loading: true,
      total: 0,
    }).actionLabel,
    undefined,
  );
  assert.equal(
    getPendingResetEmptyState({
      hasActiveFilters: false,
      loading: false,
      total: 0,
    }).actionLabel,
    undefined,
  );
});

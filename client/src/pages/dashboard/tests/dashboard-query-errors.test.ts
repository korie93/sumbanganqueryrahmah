import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDashboardQueryErrorMessage,
  buildDashboardQueryErrorMessages,
  getDashboardQueryErrorDetail,
} from "@/pages/dashboard/dashboard-query-errors";

test("buildDashboardQueryErrorMessages returns user-facing messages only for failed dashboard queries", () => {
  const messages = buildDashboardQueryErrorMessages([
    {
      error: new Error("summary unavailable"),
      failed: true,
      label: "Ringkasan",
    },
    {
      error: null,
      failed: false,
      label: "Trend login",
    },
    {
      error: { message: "roles failed" },
      failed: true,
      label: "Taburan peranan",
    },
  ]);

  assert.deepEqual(messages, [
    "Ringkasan: summary unavailable",
    "Taburan peranan: roles failed",
  ]);
});

test("dashboard query error helpers support per-section local rendering", () => {
  assert.equal(
    buildDashboardQueryErrorMessage({
      error: new Error("trend timeout"),
      failed: true,
      label: "Trend login",
    }),
    "Trend login: trend timeout",
  );
  assert.equal(
    buildDashboardQueryErrorMessage({
      error: new Error("ignored"),
      failed: false,
      label: "Trend login",
    }),
    null,
  );
  assert.equal(getDashboardQueryErrorDetail({}), "Data gagal dimuat.");
});

import assert from "node:assert/strict";
import test from "node:test";

import { buildDashboardQueryErrorMessages } from "@/pages/dashboard/dashboard-query-errors";

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

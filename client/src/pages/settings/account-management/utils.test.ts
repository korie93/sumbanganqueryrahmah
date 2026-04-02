import assert from "node:assert/strict";
import test from "node:test";
import { formatDateTime } from "@/pages/settings/account-management/utils";

test("formatDateTime renders managed account timestamps with AM and PM in Malaysia time", () => {
  assert.equal(
    formatDateTime("2026-03-29T16:30:00.000Z"),
    "30/03/2026, 12:30 AM",
  );
});

test("formatDateTime falls back safely when the timestamp is missing", () => {
  assert.equal(formatDateTime(null), "-");
});

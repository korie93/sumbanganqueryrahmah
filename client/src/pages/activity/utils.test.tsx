import assert from "node:assert/strict";
import test from "node:test";
import { formatActivityTime } from "@/pages/activity/utils";

test("formatActivityTime renders activity timestamps with AM and PM in Malaysia time", () => {
  assert.equal(
    formatActivityTime("2026-03-29T16:30:00.000Z"),
    "30/03/2026, 12:30 AM",
  );
});

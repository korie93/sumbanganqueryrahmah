import assert from "node:assert/strict";
import test from "node:test";
import {
  formatNotificationHistoryTimestamp,
  getNotificationHistoryPresentation,
} from "@/components/navbar-notification-utils";

const NOW = new Date("2026-06-10T12:00:00+08:00").getTime();

test("notification timestamps use concise relative labels", () => {
  assert.equal(formatNotificationHistoryTimestamp(NOW - 30_000, NOW), "Baru sahaja");
  assert.equal(formatNotificationHistoryTimestamp(NOW - 5 * 60_000, NOW), "5 min lalu");
});

test("notification timestamps show a clock time for the same day", () => {
  assert.match(
    formatNotificationHistoryTimestamp(NOW - 2 * 60 * 60_000, NOW),
    /10[:.]00/,
  );
});

test("notification timestamps reject invalid numeric values", () => {
  assert.equal(
    formatNotificationHistoryTimestamp(Number.NaN, NOW),
    "Masa tidak tersedia",
  );
});

test("notification variants expose readable labels and token-based tones", () => {
  assert.deepEqual(getNotificationHistoryPresentation("destructive"), {
    label: "Ralat",
    toneClassName: "text-destructive",
  });
  assert.equal(getNotificationHistoryPresentation("success").label, "Berjaya");
});

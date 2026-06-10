import assert from "node:assert/strict";
import test from "node:test";
import {
  clearNotificationHistory,
  getNotificationHistoryListenerCountForTests,
  getNotificationHistoryStateForTests,
  markNotificationHistoryRead,
  NOTIFICATION_HISTORY_LIMIT,
  NOTIFICATION_HISTORY_LISTENER_LIMIT,
  recordNotificationHistory,
  removeNotificationHistoryEntry,
  resetNotificationHistoryForTests,
  subscribeNotificationHistoryState,
} from "@/hooks/use-notification-history";

test("notification history stores sanitized text without request metadata", () => {
  resetNotificationHistoryForTests();

  recordNotificationHistory({
    title: "  Export\u0000 failed  ",
    description: "Try\nagain",
    variant: "destructive",
    occurrenceCount: 1,
    dedupeKey: "dashboard-export",
    historyModule: "  Dashboard\u0000 Login  ",
    createdAt: 100,
  });

  const entry = getNotificationHistoryStateForTests().entries[0];
  assert.equal(entry?.title, "Export failed");
  assert.equal(entry?.description, "Try again");
  assert.equal(entry?.module, "Dashboard Login");
  assert.equal(entry?.createdAt, 100);
  assert.equal(entry?.unread, true);
});

test("notification history skips loading and non-text React content", () => {
  resetNotificationHistoryForTests();

  recordNotificationHistory({
    title: "Preparing",
    description: "Please wait",
    variant: "info",
    occurrenceCount: 1,
    loading: true,
  });
  recordNotificationHistory({
    title: ["nested"],
    description: null,
    occurrenceCount: 1,
  });

  assert.equal(getNotificationHistoryStateForTests().entries.length, 0);
});

test("notification history groups consecutive dedupe variants and tracks unread state", () => {
  resetNotificationHistoryForTests();

  recordNotificationHistory({
    title: "Refresh failed",
    variant: "destructive",
    occurrenceCount: 1,
    dedupeKey: "dashboard-refresh",
    createdAt: 100,
  });
  recordNotificationHistory({
    title: "Refresh failed",
    variant: "destructive",
    occurrenceCount: 2,
    dedupeKey: "dashboard-refresh",
    createdAt: 200,
  });

  assert.equal(getNotificationHistoryStateForTests().entries.length, 1);
  assert.equal(getNotificationHistoryStateForTests().entries[0]?.occurrenceCount, 2);
  assert.equal(getNotificationHistoryStateForTests().unreadCount, 1);

  markNotificationHistoryRead();
  assert.equal(getNotificationHistoryStateForTests().unreadCount, 0);
  assert.equal(getNotificationHistoryStateForTests().entries[0]?.unread, false);
});

test("notification history retains a status transition as a separate entry", () => {
  resetNotificationHistoryForTests();

  recordNotificationHistory({
    title: "Export failed",
    variant: "destructive",
    occurrenceCount: 2,
    dedupeKey: "dashboard-export",
  });
  recordNotificationHistory({
    title: "Export complete",
    variant: "success",
    occurrenceCount: 1,
    dedupeKey: "dashboard-export",
  });

  assert.deepEqual(
    getNotificationHistoryStateForTests().entries.map((entry) => entry.variant),
    ["success", "destructive"],
  );
});

test("notification history remains bounded and clears without retaining listeners", () => {
  resetNotificationHistoryForTests();

  for (let index = 0; index < NOTIFICATION_HISTORY_LIMIT + 5; index += 1) {
    recordNotificationHistory({
      title: `Notification ${index}`,
      variant: "info",
      occurrenceCount: 1,
      createdAt: index,
    });
  }

  assert.equal(
    getNotificationHistoryStateForTests().entries.length,
    NOTIFICATION_HISTORY_LIMIT,
  );
  clearNotificationHistory();
  assert.equal(getNotificationHistoryStateForTests().entries.length, 0);
  assert.equal(getNotificationHistoryListenerCountForTests(), 0);
});

test("notification history removes a single entry and recalculates unread state", () => {
  resetNotificationHistoryForTests();

  recordNotificationHistory({
    title: "Refresh failed",
    variant: "destructive",
    occurrenceCount: 1,
  });
  recordNotificationHistory({
    title: "Export complete",
    variant: "success",
    occurrenceCount: 1,
  });

  const [newestEntry, oldestEntry] = getNotificationHistoryStateForTests().entries;
  assert.equal(getNotificationHistoryStateForTests().unreadCount, 2);

  removeNotificationHistoryEntry(newestEntry?.id ?? "");

  const stateAfterRemove = getNotificationHistoryStateForTests();
  assert.equal(stateAfterRemove.entries.length, 1);
  assert.equal(stateAfterRemove.entries[0]?.id, oldestEntry?.id);
  assert.equal(stateAfterRemove.unreadCount, 1);

  removeNotificationHistoryEntry("missing-id");
  assert.equal(getNotificationHistoryStateForTests().entries.length, 1);
});

test("notification history normalizes invalid numeric metadata", () => {
  resetNotificationHistoryForTests();

  recordNotificationHistory({
    title: "Saved",
    occurrenceCount: Number.NaN,
    createdAt: Number.POSITIVE_INFINITY,
  });

  const entry = getNotificationHistoryStateForTests().entries[0];
  assert.equal(entry?.occurrenceCount, 1);
  assert.equal(Number.isFinite(entry?.createdAt), true);
});

test("notification history stores only safe relative action links", () => {
  resetNotificationHistoryForTests();

  recordNotificationHistory({
    title: "Export failed",
    description: "Open the dashboard to retry.",
    occurrenceCount: 1,
    historyAction: {
      label: "  Buka dashboard\n ",
      href: "/monitor?section=dashboard",
    },
  });
  recordNotificationHistory({
    title: "External blocked",
    occurrenceCount: 1,
    historyAction: {
      label: "Open external",
      href: "https://evil.example",
    },
  });
  recordNotificationHistory({
    title: "Protocol-relative blocked",
    occurrenceCount: 1,
    historyAction: {
      label: "Open external",
      href: "//evil.example",
    },
  });

  const [blockedProtocolRelative, blockedExternal, allowed] =
    getNotificationHistoryStateForTests().entries;
  assert.equal(blockedProtocolRelative?.action, undefined);
  assert.equal(blockedExternal?.action, undefined);
  assert.deepEqual(allowed?.action, {
    label: "Buka dashboard",
    href: "/monitor?section=dashboard",
  });
});

test("notification history clears stale actions on dedupe status changes", () => {
  resetNotificationHistoryForTests();

  recordNotificationHistory({
    title: "Export failed",
    variant: "destructive",
    occurrenceCount: 1,
    dedupeKey: "dashboard-export",
    historyAction: {
      label: "Buka dashboard",
      href: "/monitor?section=dashboard",
    },
    historyModule: "Dashboard Login",
  });
  recordNotificationHistory({
    title: "Export complete",
    variant: "success",
    occurrenceCount: 1,
    dedupeKey: "dashboard-export",
  });

  const [success, failure] = getNotificationHistoryStateForTests().entries;
  assert.equal(success?.variant, "success");
  assert.equal(success?.action, undefined);
  assert.equal(success?.module, undefined);
  assert.equal(failure?.variant, "destructive");
  assert.notEqual(failure?.action, undefined);
  assert.equal(failure?.module, "Dashboard Login");
});

test("notification history subscriptions are bounded and removable", () => {
  resetNotificationHistoryForTests();
  const unsubscribers = Array.from(
    { length: NOTIFICATION_HISTORY_LISTENER_LIMIT + 5 },
    () => subscribeNotificationHistoryState(() => undefined),
  );

  assert.equal(
    getNotificationHistoryListenerCountForTests(),
    NOTIFICATION_HISTORY_LISTENER_LIMIT,
  );

  for (const unsubscribe of unsubscribers) {
    unsubscribe();
  }
  assert.equal(getNotificationHistoryListenerCountForTests(), 0);
});

import assert from "node:assert/strict";
import test from "node:test";
import { performAppLogout } from "@/app/logout-flow";

test("performAppLogout waits for server logout before clearing client state", async () => {
  const events: string[] = [];

  await performAppLogout({
    activityId: "activity-1",
    activityLogout: async (activityId) => {
      events.push(`server:${activityId}:start`);
      await Promise.resolve();
      events.push(`server:${activityId}:done`);
    },
    applyLoggedOutClientState: () => {
      events.push("client:cleared");
    },
    broadcastLogoutToOtherTabs: () => {
      events.push("broadcast:other-tabs");
    },
    warn: () => {
      throw new Error("warn should not run for successful logout");
    },
  });

  assert.deepEqual(events, [
    "server:activity-1:start",
    "server:activity-1:done",
    "broadcast:other-tabs",
    "client:cleared",
  ]);
});

test("performAppLogout clears client state even when the server logout returns 401", async () => {
  const events: string[] = [];

  await performAppLogout({
    activityId: "activity-1",
    activityLogout: async () => {
      throw new Error("401: {\"message\":\"Unauthenticated\"}");
    },
    applyLoggedOutClientState: () => {
      events.push("client:cleared");
    },
    broadcastLogoutToOtherTabs: () => {
      events.push("broadcast:other-tabs");
    },
    warn: () => {
      throw new Error("warn should stay quiet for 401 logout cleanup");
    },
  });

  assert.deepEqual(events, ["broadcast:other-tabs", "client:cleared"]);
});

test("performAppLogout warns on unexpected logout failures and still clears client state", async () => {
  const warnings: Array<{ message: string; error: unknown }> = [];
  const events: string[] = [];

  await performAppLogout({
    activityId: "activity-1",
    activityLogout: async () => {
      throw new Error("500: {\"message\":\"boom\"}");
    },
    applyLoggedOutClientState: () => {
      events.push("client:cleared");
    },
    broadcastLogoutToOtherTabs: () => {
      events.push("broadcast:other-tabs");
    },
    warn: (message, error) => {
      warnings.push({ message, error });
    },
  });

  assert.deepEqual(events, ["broadcast:other-tabs", "client:cleared"]);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.message, "Logout activity failed:");
});

test("performAppLogout skips the server call when there is no activity id", async () => {
  let serverCalled = false;
  const events: string[] = [];

  await performAppLogout({
    activityLogout: async () => {
      serverCalled = true;
    },
    applyLoggedOutClientState: () => {
      events.push("client:cleared");
    },
    broadcastLogoutToOtherTabs: () => {
      events.push("broadcast:other-tabs");
    },
    warn: () => {
      throw new Error("warn should not run without a logout failure");
    },
  });

  assert.equal(serverCalled, false);
  assert.deepEqual(events, ["broadcast:other-tabs", "client:cleared"]);
});

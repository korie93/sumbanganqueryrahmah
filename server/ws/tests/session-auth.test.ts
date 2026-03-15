import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import { extractWsActivityId, isActiveWebSocketSession } from "../session-auth";

const SECRET = "ws-test-secret";

test("extractWsActivityId returns activity id for a valid token", () => {
  const token = jwt.sign({ activityId: "activity-123" }, SECRET);

  assert.equal(extractWsActivityId(token, SECRET), "activity-123");
});

test("extractWsActivityId rejects invalid or missing activity ids", () => {
  const missingActivityIdToken = jwt.sign({ userId: "user-1" }, SECRET);

  assert.equal(extractWsActivityId("not-a-token", SECRET), null);
  assert.equal(extractWsActivityId(missingActivityIdToken, SECRET), null);
  assert.equal(extractWsActivityId("", SECRET), null);
});

test("isActiveWebSocketSession accepts only active sessions without logout time", () => {
  assert.equal(
    isActiveWebSocketSession({
      id: "activity-123",
      isActive: true,
      logoutTime: null,
    }),
    true,
  );

  assert.equal(
    isActiveWebSocketSession({
      id: "activity-123",
      isActive: false,
      logoutTime: null,
    }),
    false,
  );

  assert.equal(
    isActiveWebSocketSession({
      id: "activity-123",
      isActive: true,
      logoutTime: new Date().toISOString(),
    }),
    false,
  );

  assert.equal(
    isActiveWebSocketSession({
      id: "",
      isActive: true,
      logoutTime: null,
    }),
    false,
  );

  assert.equal(isActiveWebSocketSession(null), false);
});

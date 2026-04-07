import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import { logger } from "../../lib/logger";
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

test("extractWsActivityId logs invalid token verification failures without returning an activity id", () => {
  const originalLoggerWarn = logger.warn;
  const warnings: Array<{ message: string; payload: unknown }> = [];
  logger.warn = ((message: string, payload: unknown) => {
    warnings.push({ message, payload });
  }) as typeof logger.warn;

  try {
    assert.equal(extractWsActivityId("not-a-token", SECRET), null);
  } finally {
    logger.warn = originalLoggerWarn;
  }

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].message, "WebSocket session token verification failed");
  assert.doesNotMatch(JSON.stringify(warnings[0].payload), /not-a-token/);
});

test("extractWsActivityId does not log when no token is provided", () => {
  const originalLoggerWarn = logger.warn;
  let warningCount = 0;
  logger.warn = (() => {
    warningCount += 1;
  }) as typeof logger.warn;

  try {
    assert.equal(extractWsActivityId("", SECRET), null);
  } finally {
    logger.warn = originalLoggerWarn;
  }

  assert.equal(warningCount, 0);
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

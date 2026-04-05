import assert from "node:assert/strict";
import test from "node:test";
import { WebSocket } from "ws";
import { signSessionJwt } from "../../auth/session-jwt";
import { ERROR_CODES } from "../../../shared/error-codes";
import { AuthAccountError } from "../../services/auth-account.service";
import {
  closeAuthActivitySockets,
  parseAuthBrowserName,
  signAuthTwoFactorChallengeToken,
  verifyAuthTwoFactorChallengeToken,
} from "../auth/auth-route-session-utils";

test("auth route session utils round-trip two-factor challenge tokens and normalize browser headers", () => {
  const token = signAuthTwoFactorChallengeToken({
    userId: "user-1",
    username: "alpha.user",
    role: "admin",
    fingerprint: "fp-123",
    browserName: "Chrome 120",
    pcName: "OPS-01",
    ipAddress: "127.0.0.1",
  });

  const challenge = verifyAuthTwoFactorChallengeToken(token);

  assert.equal(challenge.userId, "user-1");
  assert.equal(challenge.username, "alpha.user");
  assert.equal(challenge.role, "admin");
  assert.equal(challenge.browserName, "Chrome 120");
  assert.equal(challenge.fingerprint, "fp-123");
  assert.equal(challenge.pcName, "OPS-01");
  assert.equal(challenge.ipAddress, "127.0.0.1");
  assert.equal(
    parseAuthBrowserName(
      undefined,
      [
        "Mozilla/5.0 AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      ],
    ),
    "Chrome 120",
  );
});

test("auth route session utils reject invalid two-factor challenge tokens and close activity sockets safely", async () => {
  const invalidToken = signSessionJwt({
    purpose: "session_login",
    userId: "user-1",
    username: "alpha.user",
    role: "admin",
    browserName: "Chrome 120",
  });

  assert.throws(
    () => verifyAuthTwoFactorChallengeToken(invalidToken),
    (error: unknown) => {
      assert.ok(error instanceof AuthAccountError);
      assert.equal(error.code, ERROR_CODES.TWO_FACTOR_CHALLENGE_INVALID);
      return true;
    },
  );

  const sentMessages: string[] = [];
  let closed = false;
  const clearedActivityIds: string[] = [];
  const connectedClients = new Map<string, WebSocket>([
    [
      "activity-open",
      {
        close() {
          closed = true;
        },
        readyState: WebSocket.OPEN,
        send(message: string) {
          sentMessages.push(message);
        },
      } as unknown as WebSocket,
    ],
    [
      "activity-closed",
      {
        close() {
          throw new Error("closed sockets should not be closed again");
        },
        readyState: WebSocket.CLOSED,
        send() {
          throw new Error("closed sockets should not receive messages");
        },
      } as unknown as WebSocket,
    ],
  ]);

  closeAuthActivitySockets({
    activityIds: ["activity-open", "activity-closed", "missing-activity"],
    reason: "Password changed. Please login again.",
    connectedClients,
    storage: {
      clearCollectionNicknameSessionByActivity: async (activityId: string) => {
        clearedActivityIds.push(activityId);
      },
    },
  });

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(closed, true);
  assert.deepEqual(sentMessages, [
    JSON.stringify({
      type: "logout",
      reason: "Password changed. Please login again.",
    }),
  ]);
  assert.deepEqual(clearedActivityIds, [
    "activity-open",
    "activity-closed",
    "missing-activity",
  ]);
  assert.equal(connectedClients.size, 0);
});

import assert from "node:assert/strict";
import test from "node:test";
import { WebSocket } from "ws";
import { signSessionJwt } from "../../auth/session-jwt";
import { ERROR_CODES } from "../../../shared/error-codes";
import { AuthAccountError } from "../../services/auth-account.service";
import { logger } from "../../lib/logger";
import {
  closeAuthActivitySockets,
  parseAuthBrowserName,
  signAuthSessionTokenWithExpiry,
  signAuthTwoFactorChallengeToken,
  verifyAuthTwoFactorChallengeToken,
} from "../auth/auth-route-session-utils";

test("auth route session utils round-trip two-factor challenge tokens and normalize browser headers", () => {
  const token = signAuthTwoFactorChallengeToken({
    credentialState: "a".repeat(64),
    userId: "user-1",
    username: "alpha.user",
    role: "admin",
    fingerprint: "fp-123",
    browserName: "Chrome 120",
    deviceType: "desktop",
    pcName: "OPS-01",
    ipAddress: "127.0.0.1",
    platform: "Windows 10/11",
  });

  const challenge = verifyAuthTwoFactorChallengeToken(token);

  assert.equal(challenge.userId, "user-1");
  assert.equal(challenge.username, "alpha.user");
  assert.equal(challenge.role, "admin");
  assert.equal(challenge.browserName, "Chrome 120");
  assert.equal(challenge.deviceType, "desktop");
  assert.equal(challenge.fingerprint, "fp-123");
  assert.equal(challenge.pcName, "OPS-01");
  assert.equal(challenge.ipAddress, "127.0.0.1");
  assert.equal(challenge.platform, "Windows 10/11");
  assert.equal(challenge.credentialState, "a".repeat(64));
  assert.match(challenge.challengeId, /^[a-f0-9-]{36}$/i);
  assert.ok(challenge.expiresAtMs > Date.now());
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

test("expired and malformed 2FA JWTs produce actionable errors rather than internal failures", (t) => {
  let now = Date.parse("2026-09-12T00:00:00Z");
  t.mock.method(Date, "now", () => now);
  const token = signAuthTwoFactorChallengeToken({
    userId: "user-1", username: "admin", role: "admin", browserName: "Test",
    credentialState: "b".repeat(64),
  });
  now += 5 * 60 * 1_000;
  assert.throws(() => verifyAuthTwoFactorChallengeToken(token), (error: unknown) => {
    assert.ok(error instanceof AuthAccountError);
    assert.equal(error.code, ERROR_CODES.TWO_FACTOR_CHALLENGE_EXPIRED);
    assert.match(error.message, /sign in again/i);
    return true;
  });
  assert.throws(() => verifyAuthTwoFactorChallengeToken("malformed"), (error: unknown) => {
    assert.ok(error instanceof AuthAccountError);
    assert.equal(error.code, ERROR_CODES.TWO_FACTOR_CHALLENGE_INVALID);
    return true;
  });
});

test("auth route session utils expose the JWT-backed session expiry timestamp", () => {
  const session = signAuthSessionTokenWithExpiry({
    userId: "user-1",
    username: "alpha.user",
    role: "admin",
    activityId: "activity-1",
  });

  assert.match(session.token, /^[\w-]+\.[\w-]+\.[\w-]+$/);
  assert.equal(new Date(session.expiresAt).getTime(), session.expiresAtMs);
  assert.ok(session.expiresAtMs > Date.now());
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
        if (activityId === "missing-activity") {
          throw new Error("cleanup failed");
        }
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

test("revoked socket cleanup survives send, close and terminate failures without skipping later sessions", async (t) => {
  const warnings: unknown[][] = [];
  t.mock.method(logger, "warn", (...args: unknown[]) => { warnings.push(args); });
  const events: string[] = [];
  const clearedActivityIds: string[] = [];
  const ids = ["throwing-send", "throwing-close", "healthy", "missing"];
  const connectedClients = new Map<string, WebSocket>();
  for (const id of ids.slice(0, 3)) {
    connectedClients.set(id, {
      readyState: WebSocket.OPEN,
      send() {
        events.push(`${id}:send`);
        if (id === "throwing-send") throw new Error("PRIVATE_TRANSPORT_PAYLOAD");
      },
      close() {
        events.push(`${id}:close`);
        if (id === "throwing-close") throw new Error("PRIVATE_CLOSE_PAYLOAD");
      },
      terminate() {
        events.push(`${id}:terminate`);
        if (id === "throwing-close") throw new Error("PRIVATE_TERMINATE_PAYLOAD");
      },
    } as unknown as WebSocket);
  }

  assert.doesNotThrow(() => closeAuthActivitySockets({
    activityIds: ids,
    reason: "PRIVATE_LOGOUT_REASON",
    connectedClients,
    storage: {
      clearCollectionNicknameSessionByActivity: async (activityId: string) => {
        clearedActivityIds.push(activityId);
        if (activityId === "throwing-send") throw new Error("PRIVATE_STORAGE_ERROR");
      },
    },
  }));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(connectedClients.size, 0);
  assert.deepEqual(clearedActivityIds, ids);
  assert.deepEqual(events, [
    "throwing-send:send", "throwing-send:close", "throwing-send:terminate",
    "throwing-close:send", "throwing-close:close", "throwing-close:terminate",
    "healthy:send", "healthy:close",
  ]);
  assert.equal(warnings.length, 3);
  assert.doesNotMatch(JSON.stringify(warnings), /PRIVATE_/);
  for (const warning of warnings.slice(0, 2)) {
    assert.deepEqual(warning, ["Auth socket transport failed during revoked session cleanup", {
      operation: "closeAuthActivitySockets",
    }]);
  }
});

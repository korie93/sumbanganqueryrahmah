import assert from "node:assert/strict";
import test from "node:test";

import {
  createSensitiveApiResponseSanitizerMiddleware,
  isSensitiveResponseFieldName,
  stripSensitiveResponseFields,
} from "../response-sanitizer";
import { createInternalMetrics } from "../../internal/metrics";
import {
  createJsonTestApp,
  startTestServer,
  stopTestServer,
} from "../../routes/tests/http-test-utils";

function asRecord(value: unknown): Record<string, unknown> {
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
  assert.equal(Array.isArray(value), false);
  return value as Record<string, unknown>;
}

test("stripSensitiveResponseFields removes nested sensitive fields without removing allowed auth challenges", () => {
  const createdAt = new Date("2026-06-01T00:00:00.000Z");
  const result = stripSensitiveResponseFields({
    ok: true,
    challengeToken: "two-factor-challenge-token-is-intentionally-returned",
    createdAt,
    rows: [
      {
        hashedPassword: "hash",
        name: "Aminah",
      },
    ],
    user: {
      id: "user-1",
      passwordHash: "hash",
      security: {
        encryptedTotpSecret: "secret",
        totpSecretEncrypted: "secret",
      },
      username: "aminah",
    },
  });

  const payload = asRecord(result.value);
  assert.equal(result.removedCount, 4);
  assert.equal(payload.challengeToken, "two-factor-challenge-token-is-intentionally-returned");
  assert.equal(payload.createdAt, createdAt);

  const user = asRecord(payload.user);
  assert.equal("passwordHash" in user, false);
  assert.equal(user.id, "user-1");
  assert.equal(user.username, "aminah");

  const security = asRecord(user.security);
  assert.equal("encryptedTotpSecret" in security, false);
  assert.equal("totpSecretEncrypted" in security, false);

  const rows = payload.rows as unknown[];
  assert.equal(Array.isArray(rows), true);
  assert.equal("hashedPassword" in asRecord(rows[0]), false);
});

test("isSensitiveResponseFieldName normalizes common database and API field spellings", () => {
  assert.equal(isSensitiveResponseFieldName("password_hash"), true);
  assert.equal(isSensitiveResponseFieldName("passwordHash"), true);
  assert.equal(isSensitiveResponseFieldName("TOTP_SECRET_ENCRYPTED"), true);
  assert.equal(isSensitiveResponseFieldName("challengeToken"), false);
  assert.equal(isSensitiveResponseFieldName("sessionExpiresAt"), false);
});

test("createSensitiveApiResponseSanitizerMiddleware strips JSON response fields and records aggregate metrics", async () => {
  const metrics = createInternalMetrics();
  const warningLogs: Array<{ message: string; metadata?: Record<string, unknown> }> = [];
  const app = createJsonTestApp();

  app.use("/api", createSensitiveApiResponseSanitizerMiddleware({
    logger: {
      warn(message, metadata) {
        warningLogs.push(metadata === undefined ? { message } : { message, metadata });
      },
    },
    metrics,
  }));
  app.get("/api/leaky", (_req, res) => {
    res.json({
      ok: true,
      profile: {
        passwordSalt: "salt",
        username: "operator",
      },
      twoFactorSecretEncrypted: "secret",
    });
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/leaky`);
    assert.equal(response.status, 200);
    const payload = asRecord(await response.json());
    assert.equal("twoFactorSecretEncrypted" in payload, false);
    assert.equal("passwordSalt" in asRecord(payload.profile), false);
    assert.equal(asRecord(payload.profile).username, "operator");

    assert.equal(metrics.snapshot().counters.apiResponseSensitiveFieldsStrippedTotal, 2);
    assert.equal(warningLogs.length, 1);
    assert.equal(warningLogs[0]?.message, "API response sanitizer stripped sensitive fields");
    assert.equal(warningLogs[0]?.metadata?.removedCount, 2);
    assert.equal(warningLogs[0]?.metadata?.path, "/api/leaky");
  } finally {
    await stopTestServer(server);
  }
});

import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeErrorStackForLog, sanitizeForLog, sanitizeForLogAllowList } from "../logger";

test("sanitizeForLog redacts snake_case, kebab-case, and dotted PII keys", () => {
  const sanitized = sanitizeForLog({
    customer_name: "Alice Tan",
    "customer-phone": "0123111222",
    "staff.name": "Staff User",
    nested: {
      ic_number: "900101015555",
      account_number: "ACC-1001",
      amount: "120.50",
    },
  }) as Record<string, unknown>;

  assert.equal(sanitized.customer_name, "[REDACTED]");
  assert.equal(sanitized["customer-phone"], "[REDACTED]");
  assert.equal(sanitized["staff.name"], "[REDACTED]");
  assert.deepEqual(sanitized.nested, {
    ic_number: "[REDACTED]",
    account_number: "[REDACTED]",
    amount: "[REDACTED]",
  });
});

test("sanitizeForLog redacts collection blind-index search hash keys", () => {
  const sanitized = sanitizeForLog({
    customer_name_search_hash: "hash-1",
    customerPhoneSearchHash: "hash-2",
    account_number_search_hash: "hash-3",
  }) as Record<string, unknown>;

  assert.equal(sanitized.customer_name_search_hash, "[REDACTED]");
  assert.equal(sanitized.customerPhoneSearchHash, "[REDACTED]");
  assert.equal(sanitized.account_number_search_hash, "[REDACTED]");
});

test("sanitizeForLog keeps ordinary operational metadata intact", () => {
  const sanitized = sanitizeForLog({
    requestId: "req-1",
    userAgent: "Mozilla/5.0",
    activityId: "activity-1",
    statusCode: 409,
    nested: {
      scope: "collection:list",
    },
  }) as Record<string, unknown>;

  assert.deepEqual(sanitized, {
    requestId: "req-1",
    userAgent: "Mozilla/5.0",
    activityId: "activity-1",
    statusCode: 409,
    nested: {
      scope: "collection:list",
    },
  });
});

test("sanitizeForLogAllowList redacts fields that are not explicitly allowlisted", () => {
  const sanitized = sanitizeForLogAllowList({
    requestId: "req-1",
    statusCode: 200,
    retryAfterMs: 1500,
    strikeCount: 2,
    rawBody: { nested: "secret-shaped payload" },
    nested: {
      scope: "collection:list",
    },
  }) as Record<string, unknown>;

  assert.equal(sanitized.requestId, "req-1");
  assert.equal(sanitized.statusCode, 200);
  assert.equal(sanitized.retryAfterMs, 1500);
  assert.equal(sanitized.strikeCount, 2);
  assert.equal(sanitized.rawBody, "[REDACTED]");
  assert.equal(sanitized.nested, "[REDACTED]");
});

test("sanitizeForLogAllowList still auto-redacts sensitive keys and freeform values", () => {
  const sanitized = sanitizeForLogAllowList({
    event: "auth_failure",
    userId: "user-1",
    username: "superuser",
    message: "Send follow-up to ops@example.com",
    error: {
      name: "Error",
      message: "Bearer abcdefghijklmnopqrstuvwxyz should not leak",
      query: "select * from users",
    },
  }) as Record<string, unknown>;

  assert.equal(sanitized.event, "auth_failure");
  assert.equal(sanitized.userId, "[REDACTED]");
  assert.equal(sanitized.username, "[REDACTED]");
  assert.equal(sanitized.message, "Send follow-up to [REDACTED]");
  assert.deepEqual(sanitized.error, {
    name: "Error",
    message: "[REDACTED] should not leak",
    query: "[REDACTED]",
  });
});

test("sanitizeForLog redacts phone numbers and valid credit cards inside freeform strings", () => {
  const sanitized = sanitizeForLog({
    details: "Contact ops@example.com or 012-3111222 and retry card 4111 1111 1111 1111 immediately.",
    nested: [
      "Escalate to finance.ops@example.my or +6012 555 7788 if payment 4012-8888-8888-1881 still fails.",
    ],
  }) as Record<string, unknown>;

  assert.equal(
    sanitized.details,
    "Contact [REDACTED] or [REDACTED] and retry card [REDACTED] immediately.",
  );
  assert.deepEqual(sanitized.nested, [
    "Escalate to [REDACTED] or [REDACTED] if payment [REDACTED] still fails.",
  ]);
});

test("sanitizeForLog redacts PostgreSQL connection URLs inside freeform strings", () => {
  const sanitized = sanitizeForLog({
    message: "connect ECONNREFUSED postgresql://sqr_user:sqr-secret@db.internal:5432/sqr_db",
    stack: "Error: failed for postgres://postgres:secret@127.0.0.1:5432/sqr_db\n    at connect",
  }) as Record<string, unknown>;

  assert.equal(sanitized.message, "connect ECONNREFUSED [REDACTED]");
  assert.equal(sanitized.stack, "Error: failed for [REDACTED]\n    at connect");
});

test("sanitizeForLog bounds recursive traversal and marks circular references", () => {
  const circular: Record<string, unknown> = { event: "loop" };
  circular.self = circular;

  const deep: Record<string, unknown> = {};
  let cursor = deep;
  for (let index = 0; index < 12; index += 1) {
    cursor.child = {};
    cursor = cursor.child as Record<string, unknown>;
  }

  const sanitizedCircular = sanitizeForLog(circular) as Record<string, unknown>;
  assert.equal(sanitizedCircular.self, "[CIRCULAR_REFERENCE]");

  let sanitizedDeepCursor = sanitizeForLog(deep) as Record<string, unknown>;
  for (let index = 0; index < 10; index += 1) {
    sanitizedDeepCursor = sanitizedDeepCursor.child as Record<string, unknown>;
  }
  assert.equal(sanitizedDeepCursor.child, "[MAX_DEPTH_EXCEEDED]");
});

test("sanitizeForLogAllowList preserves allowlisted Error codes while bounding recursive metadata", () => {
  const error = Object.assign(new Error("Bearer abcdefghijklmnopqrstuvwxyz should not leak"), {
    code: "E_TEST",
  });
  const circular: Record<string, unknown> = {
    event: "error",
    details: {},
    error,
  };
  circular.details = circular;

  const sanitized = sanitizeForLogAllowList(circular) as Record<string, unknown>;

  assert.equal(sanitized.details, "[CIRCULAR_REFERENCE]");
  const sanitizedError = sanitized.error as Record<string, unknown>;
  assert.equal(sanitizedError.code, "E_TEST");
  assert.equal(sanitizedError.message, "[REDACTED] should not leak");
  assert.equal(sanitizedError.name, "Error");
  assert.doesNotMatch(String(sanitizedError.stack), /abcdefghijklmnopqrstuvwxyz/);
});

test("sanitizeForLog keeps invalid card-like identifiers intact to avoid false positives", () => {
  const sanitized = sanitizeForLog({
    details: "Reference 4111 1111 1111 1112 belongs to audit replay 2026-04-12.",
  }) as Record<string, unknown>;

  assert.equal(
    sanitized.details,
    "Reference 4111 1111 1111 1112 belongs to audit replay 2026-04-12.",
  );
});

test("sanitizeErrorStackForLog preserves the full sanitized stack outside production-like environments", () => {
  const stack = [
    "Error: boom at ops@example.com",
    "    at first (/srv/app.js:10:2)",
    "    at second (/srv/app.js:20:4)",
    "    at third (/srv/app.js:30:6)",
    "    at fourth (/srv/app.js:40:8)",
  ].join("\n");

  assert.equal(
    sanitizeErrorStackForLog(stack, { productionLike: false }),
    stack.replace("ops@example.com", "[REDACTED]"),
  );
});

test("sanitizeErrorStackForLog truncates production-like stacks to a short header slice", () => {
  const stack = [
    "Error: boom at ops@example.com",
    "    at first (/srv/app.js:10:2)",
    "    at second (/srv/app.js:20:4)",
    "    at third (/srv/app.js:30:6)",
    "    at fourth (/srv/app.js:40:8)",
    "    at fifth (/srv/app.js:50:10)",
  ].join("\n");

  const sanitized = sanitizeErrorStackForLog(stack, { productionLike: true });

  assert.match(String(sanitized), /Error: boom at \[REDACTED\]/);
  assert.match(String(sanitized), /at first/);
  assert.match(String(sanitized), /at third/);
  assert.doesNotMatch(String(sanitized), /at fifth/);
  assert.match(String(sanitized), /\[stack truncated for production log: 2 additional line\(s\) omitted\]/);
});

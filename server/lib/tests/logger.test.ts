import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeForLog } from "../logger";

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

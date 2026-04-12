import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTH_SESSION_COOKIE_NAME,
  readCookieValueFromHeader,
} from "../session-cookie";
import { logger } from "../../lib/logger";

test("readCookieValueFromHeader decodes valid cookie values", () => {
  assert.equal(
    readCookieValueFromHeader(
      `${AUTH_SESSION_COOKIE_NAME}=token%3Dvalue`,
      AUTH_SESSION_COOKIE_NAME,
    ),
    "token=value",
  );
});

test("readCookieValueFromHeader rejects malformed percent-encoded cookies and logs a warning", () => {
  const originalWarn = logger.warn;
  const warnings: Array<{ message: string; payload: Record<string, unknown> | undefined }> = [];
  logger.warn = ((message: string, payload?: Record<string, unknown>) => {
    warnings.push({ message, payload });
  }) as typeof logger.warn;

  try {
    assert.equal(
      readCookieValueFromHeader(
        `${AUTH_SESSION_COOKIE_NAME}=%E0%A4%A`,
        AUTH_SESSION_COOKIE_NAME,
      ),
      null,
    );
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].message, "Failed to decode auth cookie value");
    assert.equal(warnings[0].payload?.cookieName, AUTH_SESSION_COOKIE_NAME);
  } finally {
    logger.warn = originalWarn;
  }
});

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import {
  AUTH_SESSION_MAX_AGE_MS,
  AUTH_SESSION_COOKIE_NAME,
  AUTH_SESSION_CSRF_COOKIE_NAME,
  AUTH_SESSION_CSRF_HEADER_NAME,
  compareAuthSessionCsrfTokens,
  readAuthSessionTokenFromHeaders,
  readAuthSessionCsrfTokenFromHeaders,
  readCookieValueFromHeader,
  rotateAuthSessionCsrfCookie,
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

test("rotateAuthSessionCsrfCookie refreshes only the csrf cookie", () => {
  const cookies: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
  const headers = new Map<string, unknown>();
  const res = {
    setHeader: (name: string, value: unknown) => {
      headers.set(name, value);
    },
    cookie: (name: string, value: string, options: Record<string, unknown>) => {
      cookies.push({ name, value, options });
    },
  };

  rotateAuthSessionCsrfCookie(res as never);

  assert.equal(cookies.length, 1);
  assert.equal(cookies[0]?.name, AUTH_SESSION_CSRF_COOKIE_NAME);
  assert.equal(typeof cookies[0]?.value, "string");
  assert.equal(cookies[0]?.value.length, 64);
  assert.equal(headers.get(AUTH_SESSION_CSRF_HEADER_NAME), cookies[0]?.value);
  assert.equal(cookies[0]?.options.httpOnly, false);
  assert.equal(cookies[0]?.options.sameSite, "strict");
  assert.equal(cookies[0]?.options.maxAge, AUTH_SESSION_MAX_AGE_MS);
});

test("readAuthSessionTokenFromHeaders accepts one well-formed bearer token", () => {
  assert.equal(
    readAuthSessionTokenFromHeaders({ authorization: "Bearer header.payload.signature" }),
    "header.payload.signature",
  );
  assert.equal(
    readAuthSessionTokenFromHeaders({ authorization: "bearer\tapi-token" }),
    "api-token",
  );
});

test("readAuthSessionTokenFromHeaders rejects empty or ambiguous bearer values", () => {
  for (const authorization of [
    "Bearer",
    "Bearer ",
    "Bearer\t",
    "Bearer token extra",
    "Basic token",
  ]) {
    assert.equal(readAuthSessionTokenFromHeaders({ authorization }), null);
  }
});

test("readAuthSessionCsrfTokenFromHeaders accepts matching fixed-length csrf tokens", () => {
  const csrfToken = "a".repeat(64);

  assert.equal(
    readAuthSessionCsrfTokenFromHeaders({
      cookie: `${AUTH_SESSION_CSRF_COOKIE_NAME}=${csrfToken}`,
      "x-csrf-token": csrfToken,
    }),
    csrfToken,
  );
});

test("readAuthSessionCsrfTokenFromHeaders rejects unequal or non-standard csrf token lengths safely", () => {
  const csrfToken = "a".repeat(64);

  assert.equal(
    readAuthSessionCsrfTokenFromHeaders({
      cookie: `${AUTH_SESSION_CSRF_COOKIE_NAME}=${csrfToken}`,
      "x-csrf-token": "a".repeat(63),
    }),
    null,
  );

  assert.equal(
    readAuthSessionCsrfTokenFromHeaders({
      cookie: `${AUTH_SESSION_CSRF_COOKIE_NAME}=short`,
      "x-csrf-token": "short",
    }),
    null,
  );
});

test("compareAuthSessionCsrfTokens rejects malformed values without throwing", () => {
  const csrfToken = "b".repeat(64);

  assert.equal(compareAuthSessionCsrfTokens(null, csrfToken), false);
  assert.equal(compareAuthSessionCsrfTokens(undefined, csrfToken), false);
  assert.equal(compareAuthSessionCsrfTokens({ token: csrfToken }, csrfToken), false);
  assert.equal(compareAuthSessionCsrfTokens("", csrfToken), false);
  assert.equal(compareAuthSessionCsrfTokens(csrfToken, null), false);
});

test("compareAuthSessionCsrfTokens handles random token fuzz cases safely", () => {
  for (let index = 0; index < 250; index += 1) {
    const csrfToken = randomBytes(32).toString("hex");
    const otherToken = randomBytes(32).toString("hex");
    const shortToken = csrfToken.slice(0, 12);
    const longToken = `${csrfToken}${otherToken}`;

    assert.equal(compareAuthSessionCsrfTokens(csrfToken, csrfToken), true);
    assert.equal(compareAuthSessionCsrfTokens(csrfToken, otherToken), false);
    assert.equal(compareAuthSessionCsrfTokens(shortToken, csrfToken), false);
    assert.equal(compareAuthSessionCsrfTokens(longToken, csrfToken), false);
  }
});

function measureAverageComparisonNs(callback: () => void, iterations: number): number {
  for (let index = 0; index < 1_000; index += 1) {
    callback();
  }

  const startedAt = process.hrtime.bigint();
  for (let index = 0; index < iterations; index += 1) {
    callback();
  }
  const elapsedNs = Number(process.hrtime.bigint() - startedAt);
  return elapsedNs / iterations;
}

function measureBestAverageComparisonNs(callback: () => void, iterations: number, samples = 5): number {
  const averages: number[] = [];
  for (let index = 0; index < samples; index += 1) {
    averages.push(measureAverageComparisonNs(callback, iterations));
  }
  return Math.min(...averages);
}

test("constant-time csrf comparisons keep invalid token timing within 5 microseconds per comparison", () => {
  const csrfToken = randomBytes(32).toString("hex");
  const wrongToken = randomBytes(32).toString("hex");
  const iterations = 10_000;

  const validAverageNs = measureBestAverageComparisonNs(() => {
    compareAuthSessionCsrfTokens(csrfToken, csrfToken);
  }, iterations);
  const wrongAverageNs = measureBestAverageComparisonNs(() => {
    compareAuthSessionCsrfTokens(wrongToken, csrfToken);
  }, iterations);
  const shortAverageNs = measureBestAverageComparisonNs(() => {
    compareAuthSessionCsrfTokens("short", csrfToken);
  }, iterations);
  const malformedAverageNs = measureBestAverageComparisonNs(() => {
    compareAuthSessionCsrfTokens(null, csrfToken);
  }, iterations);

  assert.ok(Math.abs(validAverageNs - wrongAverageNs) < 5_000);
  assert.ok(Math.abs(validAverageNs - shortAverageNs) < 5_000);
  assert.ok(Math.abs(validAverageNs - malformedAverageNs) < 5_000);
});

import assert from "node:assert/strict";
import test from "node:test";
import type { Request } from "express";
import { createForwardedForTrustProxyWarningMiddleware } from "../forwarded-proxy-warning";

function createRequest(headers: Request["headers"]): Request {
  return {
    headers,
  } as Request;
}

test("forwarded proxy warning emits once when x-forwarded-for arrives without TRUSTED_PROXIES", () => {
  const warnings: Array<{ message: string; payload: unknown }> = [];
  const middleware = createForwardedForTrustProxyWarningMiddleware({
    trustedProxies: [],
    logger: {
      warn(message, payload) {
        warnings.push({ message, payload });
      },
    },
  });
  let nextCalls = 0;
  const next = () => {
    nextCalls += 1;
  };

  middleware(createRequest({ "x-forwarded-for": "203.0.113.10" }), {} as never, next);
  middleware(createRequest({ "x-forwarded-for": "198.51.100.20" }), {} as never, next);

  assert.equal(nextCalls, 2);
  assert.deepEqual(warnings, [
    {
      message: "TRUSTED_PROXIES not configured - rate limit may be ineffective",
      payload: {
        forwardedForPresent: true,
        trustedProxiesConfigured: false,
      },
    },
  ]);
});

test("forwarded proxy warning stays silent when trusted proxies are configured", () => {
  const warnings: unknown[] = [];
  const middleware = createForwardedForTrustProxyWarningMiddleware({
    trustedProxies: ["loopback"],
    logger: {
      warn(message, payload) {
        warnings.push({ message, payload });
      },
    },
  });

  middleware(createRequest({ "x-forwarded-for": "203.0.113.10" }), {} as never, () => undefined);

  assert.equal(warnings.length, 0);
});

import assert from "node:assert/strict";
import test from "node:test";
import type { Request, RequestHandler, Response } from "express";
import { createApiProtectionMiddleware } from "../../internal/apiProtection";
import type { WorkerControlState } from "../../internal/runtime-monitor-manager";

function control(mode: WorkerControlState["mode"] = "NORMAL", throttleFactor = 1) {
  return { mode, throttleFactor } as WorkerControlState;
}

function request(userId: string | null, path = "/api/settings/tab-visibility", method = "GET", ip = "192.0.2.10") {
  return {
    method, path, ip, headers: {}, socket: { remoteAddress: ip },
    ...(userId ? { user: { userId } } : {}),
  } as unknown as Request;
}

async function invoke(middleware: RequestHandler, req: Request) {
  const headers = new Map<string, string>();
  let status = 200;
  let body: Record<string, unknown> = {};
  await new Promise<void>((resolve, reject) => {
    const res = {
      headersSent: false,
      setHeader(name: string, value: unknown) { headers.set(name.toLowerCase(), String(value)); },
      status(code: number) { status = code; return this; },
      json(value: Record<string, unknown>) { body = value; resolve(); return this; },
    } as unknown as Response;
    middleware(req, res, (error?: unknown) => error ? reject(error) : resolve());
  });
  return { status, headers, body };
}

const officeRoutes = [
  ["GET", "/api/settings/tab-visibility"],
  ["GET", "/api/app-config"],
  ["GET", "/api/maintenance-status"],
  ["GET", "/api/analytics/summary"],
  ["POST", "/api/activity/heartbeat"],
  ["GET", "/api/me"],
  ["POST", "/api/collection"],
  ["GET", "/api/collection/daily/overview"],
  ["GET", "/api/collection/report/billing-principal/target/overview"],
  ["GET", "/api/collection/report/billing-principal/target/calendar"],
] as const;

for (const users of [20, 30, 50, 100]) {
  for (const mode of ["NORMAL", "DEGRADED", "PROTECTION"] as const) {
    test(`${users} authenticated users sharing one NAT retain normal endpoint access in ${mode}`, async (t) => {
      t.mock.method(Date, "now", () => 1_000_000);
      const protection = createApiProtectionMiddleware({
        getControlState: () => control(mode, 0.2), getDbProtection: () => false,
      });
      t.after(protection.stopAdaptiveRateStateSweep);
      const results = await Promise.all(Array.from({ length: users }, async (_, user) => {
        const responses = [];
        for (const [method, path] of officeRoutes) {
          responses.push(await invoke(protection.adaptiveRateLimit, request(`staff-${user}`, path, method)));
        }
        return responses;
      }));
      assert.equal(results.flat().filter(({ status }) => status !== 200).length, 0);
    });
  }
}

test("read quota abuse affects only that user, not another user or collection writes", async (t) => {
  t.mock.method(Date, "now", () => 1_000_000);
  const protection = createApiProtectionMiddleware({
    getControlState: () => control(), getDbProtection: () => false,
  });
  t.after(protection.stopAdaptiveRateStateSweep);
  for (let index = 0; index < 84; index++) {
    assert.equal((await invoke(protection.adaptiveRateLimit, request("noisy"))).status, 200);
  }
  const blocked = await invoke(protection.adaptiveRateLimit, request("noisy"));
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get("ratelimit-limit"), "84");
  assert.equal((await invoke(protection.adaptiveRateLimit, request("healthy"))).status, 200);
  assert.equal((await invoke(protection.adaptiveRateLimit, request("noisy", "/api/settings", "POST"))).status, 200);
});

test("write and upload quotas isolate users and do not consume read or heartbeat quotas", async (t) => {
  t.mock.method(Date, "now", () => 1_000_000);
  const protection = createApiProtectionMiddleware({ getControlState: () => control(), getDbProtection: () => false });
  t.after(protection.stopAdaptiveRateStateSweep);
  for (let index = 0; index < 17; index++) {
    assert.equal((await invoke(protection.adaptiveRateLimit, request("writer", "/api/collection", "POST"))).status, 200);
  }
  const blocked = await invoke(protection.adaptiveRateLimit, request("writer", "/api/collection", "POST"));
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.limiter, "user-rate-limit");
  assert.equal(blocked.headers.get("retry-after"), "10");
  assert.equal((await invoke(protection.adaptiveRateLimit, request("other", "/api/collection", "POST"))).status, 200);
  assert.equal((await invoke(protection.adaptiveRateLimit, request("writer", "/api/collection"))).status, 200);
  assert.equal((await invoke(protection.adaptiveRateLimit, request("writer", "/api/activity/heartbeat", "POST"))).status, 200);
  for (let index = 0; index < 2; index++) {
    assert.equal((await invoke(protection.adaptiveRateLimit, request("uploader", "/api/collection/receipts", "POST"))).status, 200);
  }
  assert.equal((await invoke(protection.adaptiveRateLimit, request("uploader", "/api/collection/receipts", "POST"))).status, 429);
  for (let index = 0; index < 3; index++) {
    assert.equal((await invoke(protection.adaptiveRateLimit, request("uploader", "/api/collection/receipts/receipt"))).status, 200);
  }
});

test("aggregate authenticated flood remains bounded across routes and users in protection mode", async (t) => {
  t.mock.method(Date, "now", () => 1_000_000);
  const protection = createApiProtectionMiddleware({
    authenticatedIpLimitPerMinute: 600,
    getControlState: () => control("PROTECTION", 0.2), getDbProtection: () => false,
  });
  t.after(protection.stopAdaptiveRateStateSweep);
  const responses = await Promise.all(Array.from({ length: 101 }, (_, index) => invoke(
    protection.adaptiveRateLimit,
    request(`user-${index}`, index % 2 ? "/api/analytics/summary" : "/api/app-config"),
  )));
  assert.equal(responses.filter(({ status }) => status === 200).length, 100);
  const blocked = responses.find(({ status }) => status === 429)!;
  assert.equal(blocked.body.limiter, "aggregate-ip-flood-guard");
  assert.equal(blocked.headers.get("ratelimit-limit"), "100");
  assert.equal((await invoke(protection.adaptiveRateLimit, request("other-office", "/api/app-config", "GET", "192.0.2.11"))).status, 200);
});

test("blocked user attempts cannot exhaust other users' aggregate allowance", async (t) => {
  t.mock.method(Date, "now", () => 1_000_000);
  const protection = createApiProtectionMiddleware({
    authenticatedIpLimitPerMinute: 600, userLimitsPerMinute: { reads: 6 },
    getControlState: () => control(), getDbProtection: () => false,
  });
  t.after(protection.stopAdaptiveRateStateSweep);
  assert.equal((await invoke(protection.adaptiveRateLimit, request("noisy"))).status, 200);
  for (let index = 0; index < 110; index++) {
    assert.equal((await invoke(protection.adaptiveRateLimit, request("noisy"))).status, 429);
  }
  assert.equal((await invoke(protection.adaptiveRateLimit, request("healthy"))).status, 200);
});

test("anonymous traffic remains IP limited, independent of the authenticated NAT guard", async (t) => {
  t.mock.method(Date, "now", () => 1_000_000);
  const protection = createApiProtectionMiddleware({ getControlState: () => control(), getDbProtection: () => false });
  t.after(protection.stopAdaptiveRateStateSweep);
  for (let index = 0; index < 40; index++) {
    assert.equal((await invoke(protection.adaptiveRateLimit, request(null))).status, 200);
  }
  const blocked = await invoke(protection.adaptiveRateLimit, request(null));
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.limiter, "anonymous-ip-limit");
  assert.equal((await invoke(protection.adaptiveRateLimit, request("staff"))).status, 200);
});

test("only exact POST login aliases delegate to account and network route guards", async (t) => {
  t.mock.method(Date, "now", () => 1_000_000);
  const protection = createApiProtectionMiddleware({ getControlState: () => control("PROTECTION", 0.2), getDbProtection: () => false });
  t.after(protection.stopAdaptiveRateStateSweep);
  for (let index = 0; index < 100; index++) {
    assert.equal((await invoke(protection.adaptiveRateLimit, request(null, index % 2 ? "/api/login" : "/api/auth/login", "POST"))).status, 200);
  }
  for (let index = 0; index < 8; index++) {
    assert.equal((await invoke(protection.adaptiveRateLimit, request(null, "/api/auth/login/unknown", "POST"))).status, 200);
  }
  assert.equal((await invoke(protection.adaptiveRateLimit, request(null, "/api/auth/login", "GET"))).status, 429);
});

test("heavy route runtime protection still bounds each user and rejects heavy work", async (t) => {
  t.mock.method(Date, "now", () => 1_000_000);
  const state = { ...control("PROTECTION", 0.2), rejectHeavyRoutes: true };
  const protection = createApiProtectionMiddleware({ getControlState: () => state, getDbProtection: () => true });
  t.after(protection.stopAdaptiveRateStateSweep);
  for (let index = 0; index < 4; index++) {
    assert.equal((await invoke(protection.adaptiveRateLimit, request("staff", "/api/ai/chat", "POST"))).status, 200);
  }
  assert.equal((await invoke(protection.adaptiveRateLimit, request("staff", "/api/ai/chat", "POST"))).status, 429);
  assert.equal((await invoke(protection.systemProtectionMiddleware, request("staff", "/api/ai/chat", "POST"))).status, 503);
  assert.equal((await invoke(protection.systemProtectionMiddleware, request("staff", "/api/search/advanced"))).status, 503);
  assert.equal((await invoke(protection.systemProtectionMiddleware, request("staff", "/api/me"))).status, 200);
});

test("same user cannot multiply quota with sessions or IPv6 address changes; windows expire", async (t) => {
  let now = 1_000_000;
  t.mock.method(Date, "now", () => now);
  const protection = createApiProtectionMiddleware({
    userLimitsPerMinute: { reads: 6 }, getControlState: () => control(), getDbProtection: () => false,
  });
  t.after(protection.stopAdaptiveRateStateSweep);
  assert.equal((await invoke(protection.adaptiveRateLimit, request("staff", "/api/app-config", "GET", "2001:db8::1"))).status, 200);
  assert.equal((await invoke(protection.adaptiveRateLimit, request("staff", "/api/app-config", "GET", "2001:db8::2"))).status, 429);
  now += 10_000;
  assert.equal((await invoke(protection.adaptiveRateLimit, request("staff"))).status, 200);
});

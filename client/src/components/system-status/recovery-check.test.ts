import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { checkServiceRecovery } from "./recovery-check";

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function queueResponses(context: TestContext, responses: Response[]) {
  let index = 0;
  return context.mock.method(globalThis, "fetch", async () => {
    const response = responses[index++];
    assert.ok(response, "Recovery must not issue any extra requests or query a database readiness endpoint.");
    return response;
  });
}

test("recovery requires explicit ready=true and maintenance=false using exactly two cheap same-origin GETs", async (context) => {
  const calls: Array<{ url: string; options: RequestInit | undefined }> = [];
  const responses = [json({ ready: true }), json({ maintenance: false })];
  context.mock.method(globalThis, "fetch", async (input: string | URL | Request, options?: RequestInit) => {
    calls.push({ url: String(input), options });
    const response = responses.shift();
    assert.ok(response);
    return response;
  });
  const controller = new AbortController();

  assert.equal(await checkServiceRecovery(controller.signal), "restored");
  assert.deepEqual(calls.map(({ url }) => url), ["/api/health/live", "/api/maintenance-status"]);
  for (const { options } of calls) {
    assert.ok(options);
    assert.equal(options.signal, controller.signal);
    assert.equal(options.cache, "no-store");
    assert.equal(options.credentials, "same-origin");
    assert.equal(options.redirect, "error");
    assert.equal(options.method ?? "GET", "GET");
    assert.equal(options.body, undefined, "Recovery must never replay a submitted form.");
    assert.equal(new Headers(options.headers).get("Accept"), "application/json");
  }
});

test("a healthy process still in maintenance is not restored", async (context) => {
  const fetch = queueResponses(context, [json({ ready: true }), json({ maintenance: true })]);
  assert.equal(await checkServiceRecovery(new AbortController().signal), "maintenance");
  assert.equal(fetch.mock.callCount(), 2);
});

for (const value of [{ ready: false }, { ready: "true" }, { ready: 1 }, {}, [], null, true]) {
  test(`HTTP 200 liveness with ${JSON.stringify(value)} is not recovery`, async (context) => {
    const fetch = queueResponses(context, [json(value)]);
    assert.equal(await checkServiceRecovery(new AbortController().signal), "unavailable");
    assert.equal(fetch.mock.callCount(), 1, "Do not check maintenance while the process is not explicitly ready.");
  });
}

for (const value of [{ maintenance: "false" }, { maintenance: 0 }, {}, [], null, false]) {
  test(`maintenance payload ${JSON.stringify(value)} cannot claim recovery`, async (context) => {
    const fetch = queueResponses(context, [json({ ready: true }), json(value)]);
    assert.equal(await checkServiceRecovery(new AbortController().signal), "unavailable");
    assert.equal(fetch.mock.callCount(), 2);
  });
}

for (const endpoint of ["liveness", "maintenance"] as const) {
  for (const status of [401, 403, 404, 429, 500, 502, 503, 504]) {
    test(`${endpoint} HTTP ${status} does not trigger false recovery or retries`, async (context) => {
      const invalid = json({ ready: true, maintenance: false }, status);
      const responses = endpoint === "liveness" ? [invalid] : [json({ ready: true }), invalid];
      const fetch = queueResponses(context, responses);
      assert.equal(await checkServiceRecovery(new AbortController().signal), "unavailable");
      assert.equal(fetch.mock.callCount(), responses.length);
    });
  }

  test(`${endpoint} HTML response is unavailable, even if its body looks like JSON`, async (context) => {
    const invalid = new Response('{"ready":true,"maintenance":false}', {
      headers: { "Content-Type": "text/html" },
    });
    const responses = endpoint === "liveness" ? [invalid] : [json({ ready: true }), invalid];
    queueResponses(context, responses);
    assert.equal(await checkServiceRecovery(new AbortController().signal), "unavailable");
    assert.equal(invalid.bodyUsed, false, "An HTML error document must not be parsed as an API response.");
  });

  for (const [label, body] of [
    ["malformed", "{invalid"],
    ["oversized raw body", JSON.stringify({ ready: true, maintenance: false }) + " ".repeat(16_384)],
    ["oversized string", JSON.stringify({ ready: true, maintenance: false, detail: "x".repeat(4_097) })],
    ["excessive nodes", JSON.stringify({ ready: true, maintenance: false, items: Array(101).fill(1) })],
    ["excessive depth", '{"ready":true,"maintenance":false,"nested":' + "[".repeat(10) + "0" + "]".repeat(10) + "}"],
  ]) {
    test(`${endpoint} rejects ${label} JSON without a retry`, async (context) => {
      const invalid = new Response(body, { headers: { "Content-Type": "application/json" } });
      const responses = endpoint === "liveness" ? [invalid] : [json({ ready: true }), invalid];
      const fetch = queueResponses(context, responses);
      await assert.rejects(checkServiceRecovery(new AbortController().signal), /JSON parse failed/);
      assert.equal(fetch.mock.callCount(), responses.length);
    });
  }
}

test("network failure propagates to the UI without retrying or claiming success", async (context) => {
  const failure = new TypeError("Simulated offline network");
  const fetch = context.mock.method(globalThis, "fetch", async () => { throw failure; });
  await assert.rejects(checkServiceRecovery(new AbortController().signal), (error: unknown) => error === failure);
  assert.equal(fetch.mock.callCount(), 1);
});

for (const endpoint of ["liveness", "maintenance"] as const) {
  test(`abort cancels an in-flight ${endpoint} request and never claims recovery`, async (context) => {
    const controller = new AbortController();
    let markStarted: () => void = () => {};
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    let calls = 0;
    context.mock.method(globalThis, "fetch", async (_input: string | URL | Request, options?: RequestInit) => {
      calls += 1;
      if (endpoint === "maintenance" && calls === 1) return json({ ready: true });
      assert.equal(options?.signal, controller.signal);
      markStarted();
      return new Promise<Response>((_resolve, reject) => {
        controller.signal.addEventListener("abort", () => reject(controller.signal.reason), { once: true });
      });
    });
    const pending = checkServiceRecovery(controller.signal);
    await started;
    controller.abort();
    await assert.rejects(pending, { name: "AbortError" });
    assert.equal(calls, endpoint === "liveness" ? 1 : 2);
  });
}

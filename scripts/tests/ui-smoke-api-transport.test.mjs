import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { request } from "playwright";

const smokeSource = readFileSync(path.resolve("scripts/ui-smoke.mjs"), "utf8");
const helperStart = smokeSource.indexOf("const apiJsonRequest = async");
const helperEnd = smokeSource.indexOf("const apiJsonRequestWithRetry = async", helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart);

// Exercise the actual smoke helper without starting its full browser/seed workflow.
function loadApiJsonRequest(baseUrl) {
  return vm.runInNewContext(
    `${smokeSource.slice(helperStart, helperEnd)}\napiJsonRequest;`,
    { baseUrl, readCsrfToken: async () => "synthetic-smoke-csrf" },
    { filename: "scripts/ui-smoke.mjs" },
  );
}

async function withLocalApi(handler, operation) {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  let apiContext;
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    apiContext = await request.newContext({ timeout: 5_000 });
    await operation(loadApiJsonRequest(baseUrl), { request: apiContext });
  } finally {
    try {
      await apiContext?.dispose();
    } finally {
      server.closeAllConnections();
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  }
}

function respondJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
}

for (const method of ["GET", "head"]) {
  test(`smoke ${method} recovers from one connection reset before asserting the response`, { timeout: 15_000 }, async () => {
    let attempts = 0;
    await withLocalApi((incoming, response) => {
      assert.equal(incoming.method, method.toUpperCase());
      assert.equal(incoming.url, "/api/collection/list?search=synthetic&limit=10");
      attempts += 1;
      if (attempts === 1) {
        incoming.socket.destroy();
        return;
      }
      respondJson(response, 200, { records: [{ id: "synthetic", receipts: [] }] });
    }, async (apiJsonRequest, context) => {
      const result = await apiJsonRequest(context, method, "/api/collection/list?search=synthetic&limit=10");
      assert.equal(result.status, 200);
      if (method === "GET") {
        assert.equal(result.payload.records[0].id, "synthetic");
        assert.equal(result.payload.records[0].receipts.length, 0);
      }
      assert.equal(attempts, 2);
    });
  });
}

test("smoke GET fails after three attempts when the connection keeps resetting", { timeout: 15_000 }, async () => {
  let attempts = 0;
  await withLocalApi((incoming) => {
    attempts += 1;
    incoming.socket.destroy();
  }, async (apiJsonRequest, context) => {
    await assert.rejects(apiJsonRequest(context, "GET", "/api/collection/list"), /ECONNRESET|socket hang up/);
    assert.equal(attempts, 3);
  });
});

for (const method of ["POST", "PUT", "patch", "DELETE"]) {
  test(`smoke ${method} is never replayed after a connection reset`, { timeout: 15_000 }, async () => {
    let attempts = 0;
    await withLocalApi((incoming) => {
      assert.equal(incoming.method, method.toUpperCase());
      assert.equal(incoming.headers["x-csrf-token"], "synthetic-smoke-csrf");
      attempts += 1;
      incoming.socket.destroy();
    }, async (apiJsonRequest, context) => {
      await assert.rejects(apiJsonRequest(context, method, "/api/collection", { amount: "12.34" }), /ECONNRESET|socket hang up/);
      assert.equal(attempts, 1);
    });
  });
}

for (const status of [401, 403, 500]) {
  test(`smoke GET does not retry or hide HTTP ${status}`, { timeout: 15_000 }, async () => {
    let attempts = 0;
    await withLocalApi((_incoming, response) => {
      attempts += 1;
      respondJson(response, status, { message: "synthetic API failure" });
    }, async (apiJsonRequest, context) => {
      await assert.rejects(apiJsonRequest(context, "GET", "/api/collection/list"), (error) => {
        assert.match(error.message, new RegExp(`unexpected status ${status}`));
        assert.match(error.message, /synthetic API failure/);
        return true;
      });
      assert.equal(attempts, 1);
    });
  });
}

test("smoke transport leaves HTTP 429 handling to the existing rate-limit policy", { timeout: 15_000 }, async () => {
  let attempts = 0;
  await withLocalApi((_incoming, response) => {
    attempts += 1;
    respondJson(response, 429, { retryAfter: 1 });
  }, async (apiJsonRequest, context) => {
    const result = await apiJsonRequest(context, "GET", "/api/collection/list", undefined, [200, 429]);
    assert.equal(result.status, 429);
    assert.equal(result.payload.retryAfter, 1);
    assert.equal(attempts, 1);
  });
});
